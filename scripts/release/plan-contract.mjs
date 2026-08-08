import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BUMP_ORDER, REPO_ROOT, SECTION_ORDER, bumpVersion, readPackageJson, sanitizeBranchName } from './lib.mjs';

export const RELEASE_PLAN_SCHEMA_VERSION = 1;
export const RELEASE_PLAN_BASE_REF = 'origin/dev';

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/i;

export class ReleasePlanContractError extends Error {
	constructor(message, code) {
		super(message);
		this.name = 'ReleasePlanContractError';
		this.code = code;
	}
}

export function getReleasePlansDirectory(repoRoot = REPO_ROOT) {
	return path.join(repoRoot, '.release-plans');
}

export function readReleasePlanCandidates({ repoRoot = REPO_ROOT } = {}) {
	const releasePlansDir = getReleasePlansDirectory(repoRoot);
	if (!existsSync(releasePlansDir)) {
		return [];
	}

	const fileNames = readdirSync(releasePlansDir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
		.map((entry) => entry.name)
		.sort();

	return fileNames.map((fileName) => {
		const filePath = path.join(releasePlansDir, fileName);
		let plan;
		try {
			plan = JSON.parse(readFileSync(filePath, 'utf8'));
		} catch (error) {
			throw new ReleasePlanContractError(
				`Unable to parse release plan ${fileName}: ${error instanceof Error ? error.message : String(error)}. ` +
					'Repair or remove the unreadable file before continuing because its branch ownership cannot be determined.',
				'UNREADABLE_PLAN'
			);
		}

		return {
			fileName,
			filePath,
			plan
		};
	});
}

export function discoverBranchReleasePlan({ branch, repoRoot = REPO_ROOT } = {}) {
	if (!branch?.trim()) {
		throw new ReleasePlanContractError('A non-empty branch name is required to discover a release plan.', 'MISSING_BRANCH');
	}

	const candidates = readReleasePlanCandidates({ repoRoot });
	const matches = candidates.filter(({ plan }) => plan?.branch === branch);
	if (matches.length > 1) {
		throw new ReleasePlanContractError(
			`Found multiple release plans for branch ${branch}: ${matches.map(({ fileName }) => fileName).join(', ')}. ` +
				'Remove the duplicate branch-owned plans before continuing; the checker will not choose one arbitrarily.',
			'DUPLICATE_BRANCH_PLANS'
		);
	}

	if (matches.length === 1) {
		return {
			status: 'found',
			entry: matches[0]
		};
	}

	const expectedFileName = `${sanitizeBranchName(branch)}.json`;
	const wrongBranchEntry = candidates.find(({ fileName }) => fileName === expectedFileName);
	return {
		status: 'missing',
		expectedFileName,
		wrongBranchEntry: wrongBranchEntry ?? null
	};
}

export function inspectBranchReleasePlan({ branch, baseRef = RELEASE_PLAN_BASE_REF, headRef = 'HEAD', repoRoot = REPO_ROOT } = {}) {
	if (baseRef !== RELEASE_PLAN_BASE_REF) {
		throw new ReleasePlanContractError(
			`Release plans must be validated against ${RELEASE_PLAN_BASE_REF}; received ${String(baseRef)}.`,
			'UNSUPPORTED_BASE_REF'
		);
	}

	const discovery = discoverBranchReleasePlan({ branch, repoRoot });
	if (discovery.status === 'missing') {
		return discovery;
	}

	const packageJson = readPackageJson({ repoRoot });
	const currentMergeBase = gitOutput(['merge-base', baseRef, headRef], {
		repoRoot,
		failureMessage: `Unable to resolve the merge base between ${baseRef} and ${headRef}. Fetch the complete dev and branch history, then retry.`
	});
	const issues = collectReleasePlanIssues({
		entry: discovery.entry,
		branch,
		baseRef,
		headRef,
		packageVersion: packageJson.version,
		currentMergeBase,
		repoRoot
	});

	return {
		status: issues.length === 0 ? 'valid' : 'invalid',
		entry: discovery.entry,
		currentMergeBase,
		issues
	};
}

export function assertValidBranchReleasePlan(options = {}) {
	const inspection = inspectBranchReleasePlan(options);
	const branch = options.branch;
	if (inspection.status === 'missing') {
		const wrongBranchMessage = inspection.wrongBranchEntry
			? ` The expected filename ${inspection.expectedFileName} records branch ${String(inspection.wrongBranchEntry.plan?.branch)} instead.`
			: '';
		throw new ReleasePlanContractError(
			`No release plan found whose parsed branch field equals ${branch}.${wrongBranchMessage} ` +
				'Commit the scoped work, then create one with pnpm release:plan -- --bump patch.',
			'MISSING_BRANCH_PLAN'
		);
	}

	if (inspection.status === 'invalid') {
		throw new ReleasePlanContractError(
			formatInvalidPlanMessage({ branch, entry: inspection.entry, issues: inspection.issues }),
			'INVALID_BRANCH_PLAN'
		);
	}

	return inspection;
}

export function collectReleasePlanIssues({ entry, branch, baseRef, headRef, packageVersion, currentMergeBase, repoRoot = REPO_ROOT }) {
	const plan = entry.plan;
	const issues = [];

	if (plan?.schemaVersion !== RELEASE_PLAN_SCHEMA_VERSION) {
		issues.push(`schemaVersion must be ${RELEASE_PLAN_SCHEMA_VERSION}; received ${String(plan?.schemaVersion)}`);
	}

	if (plan?.branch !== branch) {
		issues.push(`branch must be ${branch}; received ${String(plan?.branch)}`);
	}

	if (plan?.baseRef !== baseRef) {
		issues.push(`baseRef must be ${baseRef}; received ${String(plan?.baseRef)}`);
	}

	if (plan?.mergeBase !== currentMergeBase) {
		issues.push(`mergeBase is stale; expected ${currentMergeBase}, received ${String(plan?.mergeBase)}`);
	}

	if (!BUMP_ORDER.includes(plan?.bump)) {
		issues.push(`bump must be one of ${BUMP_ORDER.join(', ')}; received ${String(plan?.bump)}`);
	} else {
		let expectedTargetVersion;
		try {
			expectedTargetVersion = bumpVersion(packageVersion, plan.bump);
		} catch (error) {
			issues.push(error instanceof Error ? error.message : String(error));
		}

		if (expectedTargetVersion && plan?.targetVersion !== expectedTargetVersion) {
			issues.push(
				`targetVersion must be ${expectedTargetVersion} for package ${packageVersion} and a ${plan.bump} bump; received ${String(plan?.targetVersion)}`
			);
		}
	}

	const recordedHeadRef = typeof plan?.headRef === 'string' ? plan.headRef : '';
	if (!recordedHeadRef) {
		issues.push('headRef must be a commit SHA recorded when the plan was created');
	} else if (!FULL_COMMIT_SHA.test(recordedHeadRef)) {
		issues.push(`headRef must be a full 40-character commit SHA; received ${recordedHeadRef}`);
	} else if (!gitCommitExists(recordedHeadRef, { repoRoot })) {
		issues.push(`headRef ${recordedHeadRef} is not a reachable commit; fetch history or regenerate after confirming the branch base`);
	} else {
		if (!gitIsAncestor(recordedHeadRef, headRef, { repoRoot })) {
			issues.push(`headRef ${recordedHeadRef} is not an ancestor of ${headRef}; the branch was likely rebased or rewritten`);
		}

		if (
			typeof plan?.mergeBase === 'string' &&
			gitCommitExists(plan.mergeBase, { repoRoot }) &&
			!gitIsAncestor(plan.mergeBase, recordedHeadRef, { repoRoot })
		) {
			issues.push(`recorded mergeBase ${plan.mergeBase} is not an ancestor of headRef ${recordedHeadRef}`);
		}
	}

	if (!Array.isArray(plan?.commits) || plan.commits.length === 0) {
		issues.push('commits must contain at least one release-bearing commit');
	} else {
		const seenShas = new Set();
		for (const [index, commit] of plan.commits.entries()) {
			validateReleasePlanEntry(commit, index, issues);

			const sha = typeof commit?.sha === 'string' ? commit.sha : '';
			if (!sha) {
				issues.push(`commits[${index}].sha must be a commit SHA`);
				continue;
			}

			if (!FULL_COMMIT_SHA.test(sha)) {
				issues.push(`commits[${index}].sha must be a full 40-character commit SHA; received ${sha}`);
				continue;
			}

			if (seenShas.has(sha)) {
				issues.push(`commits contains duplicate SHA ${sha}`);
				continue;
			}
			seenShas.add(sha);

			if (!gitCommitExists(sha, { repoRoot })) {
				issues.push(`commits[${index}].sha ${sha} is not a reachable commit`);
				continue;
			}

			if (recordedHeadRef && gitCommitExists(recordedHeadRef, { repoRoot }) && !gitIsAncestor(sha, recordedHeadRef, { repoRoot })) {
				issues.push(`commit ${sha} is not an ancestor of recorded headRef ${recordedHeadRef}`);
			}

			if (
				typeof plan?.mergeBase === 'string' &&
				gitCommitExists(plan.mergeBase, { repoRoot }) &&
				!gitIsAncestor(plan.mergeBase, sha, { repoRoot })
			) {
				issues.push(`commit ${sha} does not descend from recorded mergeBase ${plan.mergeBase}`);
			}
		}
	}

	return issues;
}

export function formatInvalidPlanMessage({ branch, entry, issues }) {
	return [
		`Release plan ${entry.fileName} for branch ${branch} is invalid:`,
		...issues.map((issue) => `- ${issue}`),
		'Regenerate only after confirming the reason: pnpm release:plan -- --regenerate --bump patch --reason "describe why regeneration is required"'
	].join('\n');
}

function gitCommitExists(ref, { repoRoot }) {
	const result = runGit(['cat-file', '-e', `${ref}^{commit}`], { repoRoot });
	return result.status === 0;
}

function gitIsAncestor(ancestor, descendant, { repoRoot }) {
	const result = runGit(['merge-base', '--is-ancestor', ancestor, descendant], { repoRoot });
	return result.status === 0;
}

function gitOutput(args, { repoRoot, failureMessage }) {
	const result = runGit(args, { repoRoot });
	if (result.error) {
		throw new ReleasePlanContractError(`${failureMessage} Git could not be executed: ${result.error.message}`, 'GIT_CONTEXT_ERROR');
	}

	if (result.status !== 0) {
		const detail = (result.stderr ?? '').trim();
		throw new ReleasePlanContractError(`${failureMessage}${detail ? ` Git reported: ${detail}` : ''}`, 'GIT_CONTEXT_ERROR');
	}

	return (result.stdout ?? '').trim();
}

function validateReleasePlanEntry(entry, index, issues) {
	const prefix = `commits[${index}]`;
	if (typeof entry?.subject !== 'string' || !entry.subject.trim()) {
		issues.push(`${prefix}.subject must be a non-empty string`);
	}

	if (typeof entry?.committedAt !== 'string' || !entry.committedAt.trim() || Number.isNaN(Date.parse(entry.committedAt))) {
		issues.push(`${prefix}.committedAt must be a valid timestamp`);
	}

	if (typeof entry?.committedAtMs !== 'number' || !Number.isFinite(entry.committedAtMs)) {
		issues.push(`${prefix}.committedAtMs must be a finite number`);
	}

	if (typeof entry?.type !== 'string' || !entry.type.trim()) {
		issues.push(`${prefix}.type must be a non-empty string`);
	}

	if (entry?.scope !== null && typeof entry?.scope !== 'string') {
		issues.push(`${prefix}.scope must be a string or null`);
	}

	if (typeof entry?.description !== 'string' || !entry.description.trim()) {
		issues.push(`${prefix}.description must be a non-empty string`);
	}

	if (typeof entry?.breaking !== 'boolean') {
		issues.push(`${prefix}.breaking must be a boolean`);
	}

	if (!SECTION_ORDER.includes(entry?.section)) {
		issues.push(`${prefix}.section must be one of ${SECTION_ORDER.join(', ')}; received ${String(entry?.section)}`);
	}

	if (entry?.releaseNoteLabel !== undefined && (typeof entry.releaseNoteLabel !== 'string' || !entry.releaseNoteLabel.trim())) {
		issues.push(`${prefix}.releaseNoteLabel must be a non-empty string when provided`);
	}
}

function runGit(args, { repoRoot }) {
	return spawnSync('git', args, {
		cwd: repoRoot,
		encoding: 'utf8'
	});
}
