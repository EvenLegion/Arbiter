import { SECTION_ORDER, buildReleaseNotes, bumpVersion, resolveHighestBump } from './lib.mjs';
import { ReleasePlanContractError, collectReleasePlanStructureIssues } from './plan-contract.mjs';

export function prepareReleasePreview({ plans, packageVersion, releaseDate = new Date(), attributions = new Map() }) {
	if (!Array.isArray(plans) || plans.length === 0) {
		throw new ReleasePlanContractError('No release plans found to preview.', 'NO_RELEASE_PLANS');
	}

	assertValidReleaseAggregation(plans);
	const highestBump = resolveHighestBump(plans);
	const version = bumpVersion(packageVersion, highestBump);
	const entries = buildConsolidatedPublicEntries(plans, attributions);
	const notes = buildReleaseNotes({ version, entries, releaseDate });
	const provenance = buildReleaseProvenanceManifest({ version, plans, entries, attributions });

	return {
		version,
		highestBump,
		entries,
		notes,
		provenance
	};
}

export function collectReleaseAggregationIssues(plans) {
	const issues = [];
	for (const entry of [...plans].sort(comparePlanEntries)) {
		for (const issue of collectReleasePlanStructureIssues({ plan: entry.plan, fileName: entry.fileName })) {
			issues.push(`${entry.fileName}: ${issue}`);
		}
	}

	const groups = collectGroups(plans);
	for (const [group, groupPlans] of groups) {
		const publishers = groupPlans.filter(({ plan }) => plan.publicNote?.mode === 'publish');
		if (publishers.length === 0) {
			issues.push(
				`group ${group} has contributing plans (${groupPlans.map(({ fileName }) => fileName).join(', ')}) but no publish plan. ` +
					'Classify exactly one plan as publish and provide the consolidated public description before release preparation.'
			);
		}
		if (publishers.length > 1) {
			issues.push(
				`group ${group} has multiple publish plans: ${publishers.map(({ fileName }) => fileName).join(', ')}. ` +
					'Keep exactly one publisher and reclassify the other plans as contribute.'
			);
		}

		const sections = new Map();
		for (const entry of groupPlans) {
			const section = entry.plan.publicNote?.section;
			if (section) {
				const owners = sections.get(section) ?? [];
				owners.push(entry.fileName);
				sections.set(section, owners);
			}
		}
		if (sections.size > 1) {
			const detail = [...sections.entries()].map(([section, files]) => `${section}: ${files.join(', ')}`).join('; ');
			issues.push(
				`group ${group} has conflicting publicNote.section metadata (${detail}). ` +
					'Use one section for every contribute and publish plan in the group.'
			);
		}
	}

	return issues;
}

export function assertValidReleaseAggregation(plans) {
	const issues = collectReleaseAggregationIssues(plans);
	if (issues.length > 0) {
		throw new ReleasePlanContractError(
			`Release-plan aggregation is invalid:\n${issues.map((issue) => `- ${issue}`).join('\n')}`,
			'INVALID_RELEASE_AGGREGATION'
		);
	}
}

export function buildConsolidatedPublicEntries(plans, attributions = new Map()) {
	const publicEntries = [];
	for (const entry of [...plans].sort(comparePlanEntries)) {
		if (entry.plan.publicNote.mode !== 'standalone') {
			continue;
		}
		publicEntries.push(
			buildPublicEntry({
				mode: 'standalone',
				group: null,
				description: entry.plan.publicNote.description,
				section: entry.plan.publicNote.section,
				plans: [entry],
				attributions
			})
		);
	}

	for (const [group, groupPlans] of collectGroups(plans)) {
		const publisher = groupPlans.find(({ plan }) => plan.publicNote.mode === 'publish');
		if (!publisher) {
			continue;
		}
		publicEntries.push(
			buildPublicEntry({
				mode: 'publish',
				group,
				description: publisher.plan.publicNote.description,
				section: publisher.plan.publicNote.section,
				plans: groupPlans,
				attributions
			})
		);
	}

	return publicEntries.sort((left, right) => {
		const sectionComparison = SECTION_ORDER.indexOf(left.section) - SECTION_ORDER.indexOf(right.section);
		if (sectionComparison !== 0) {
			return sectionComparison;
		}
		if (left.firstCommittedAtMs !== right.firstCommittedAtMs) {
			return left.firstCommittedAtMs - right.firstCommittedAtMs;
		}
		return left.key.localeCompare(right.key);
	});
}

export function buildReleaseProvenanceManifest({ version, plans, entries, attributions = new Map() }) {
	return {
		schemaVersion: 1,
		releaseVersion: version,
		plans: [...plans].sort(comparePlanEntries).map((entry) => ({
			fileName: entry.fileName,
			branch: entry.plan.branch,
			bump: entry.plan.bump,
			contributionSummary: entry.plan.contributionSummary,
			publicNote: entry.plan.publicNote,
			commits: [...entry.plan.commits].sort(compareCommits).map((commit) => enrichCommit(commit, attributions))
		})),
		publicNotes: entries.map((entry) => ({
			mode: entry.mode,
			group: entry.group,
			section: entry.section,
			description: entry.releaseNoteLabel,
			planFiles: entry.sourcePlanFiles,
			branches: entry.sourceBranches,
			commitShas: entry.commitShas,
			pullRequests: entry.pullRequests,
			contributors: entry.authorLogins
		}))
	};
}

function collectGroups(plans) {
	const groups = new Map();
	for (const entry of [...plans].sort(comparePlanEntries)) {
		const mode = entry.plan.publicNote?.mode;
		if (mode !== 'contribute' && mode !== 'publish') {
			continue;
		}
		const group = entry.plan.publicNote.group;
		const groupPlans = groups.get(group) ?? [];
		groupPlans.push(entry);
		groups.set(group, groupPlans);
	}
	return new Map([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function buildPublicEntry({ mode, group, description, section, plans, attributions }) {
	const commitsBySha = new Map();
	for (const entry of plans) {
		for (const commit of entry.plan.commits) {
			commitsBySha.set(commit.sha.toLowerCase(), commit);
		}
	}
	const commits = [...commitsBySha.values()].sort(compareCommits);
	const resolvedAttributions = commits.map((commit) => attributions.get(commit.sha.toLowerCase()) ?? commit);
	const authorLogins = [...new Set(resolvedAttributions.map((entry) => entry.authorLogin).filter(Boolean))].sort();
	const pullRequests = uniquePullRequests(resolvedAttributions);
	const sourcePlanFiles = plans.map(({ fileName }) => fileName).sort();
	const sourceBranches = plans.map(({ plan }) => plan.branch).sort();

	return {
		key: group ? `group:${group}` : `standalone:${sourcePlanFiles[0]}`,
		mode,
		group,
		section,
		releaseNoteLabel: description,
		firstCommittedAtMs: commits.reduce((earliest, commit) => Math.min(earliest, committedAtMs(commit)), Number.MAX_SAFE_INTEGER),
		sourcePlanFiles,
		sourceBranches,
		commitShas: commits.map((commit) => commit.sha),
		authorLogins,
		pullRequests
	};
}

function enrichCommit(commit, attributions) {
	const attribution = attributions.get(commit.sha.toLowerCase());
	return {
		...commit,
		pullRequest:
			attribution?.pullRequestUrl && attribution?.pullRequestNumber
				? {
						number: attribution.pullRequestNumber,
						url: attribution.pullRequestUrl
					}
				: null,
		contributor: attribution?.authorLogin ?? null
	};
}

function uniquePullRequests(entries) {
	const byUrl = new Map();
	for (const entry of entries) {
		if (!entry.pullRequestUrl) {
			continue;
		}
		byUrl.set(entry.pullRequestUrl, {
			number: entry.pullRequestNumber ?? null,
			url: entry.pullRequestUrl
		});
	}
	return [...byUrl.values()].sort((left, right) => {
		if (left.number !== null && right.number !== null && left.number !== right.number) {
			return left.number - right.number;
		}
		return left.url.localeCompare(right.url);
	});
}

function comparePlanEntries(left, right) {
	return left.fileName.localeCompare(right.fileName);
}

function compareCommits(left, right) {
	const timeComparison = committedAtMs(left) - committedAtMs(right);
	return timeComparison === 0 ? left.sha.localeCompare(right.sha) : timeComparison;
}

function committedAtMs(commit) {
	if (typeof commit.committedAtMs === 'number' && Number.isFinite(commit.committedAtMs)) {
		return commit.committedAtMs;
	}
	const parsed = Date.parse(commit.committedAt);
	return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}
