import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
export const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');
export const RELEASE_PLANS_DIR = path.join(REPO_ROOT, '.release-plans');
export const RELEASE_OUTPUT_DIR = path.join(REPO_ROOT, '.release-output');

export const BUMP_ORDER = ['patch', 'minor', 'major'];
export const SECTION_ORDER = ['Features', 'Fixes', 'Performance', 'Refactors', 'Maintenance', 'Other'];

const TYPE_TO_SECTION = {
	feat: 'Features',
	fix: 'Fixes',
	perf: 'Performance',
	refactor: 'Refactors',
	docs: 'Maintenance',
	test: 'Maintenance',
	build: 'Maintenance',
	ci: 'Maintenance',
	chore: 'Maintenance',
	style: 'Maintenance',
	revert: 'Fixes'
};

const CONVENTIONAL_COMMIT_SUBJECT = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?: (?<description>.+)$/i;

export function ensureDirectory(directoryPath) {
	if (!existsSync(directoryPath)) {
		mkdirSync(directoryPath, { recursive: true });
	}
}

export function git(args) {
	return execFileSync('git', args, {
		cwd: REPO_ROOT,
		encoding: 'utf8'
	}).trim();
}

export function gitRefExists(ref) {
	try {
		git(['rev-parse', '--verify', '--quiet', ref]);
		return true;
	} catch {
		return false;
	}
}

export function resolveBaseRef() {
	for (const candidate of ['origin/dev', 'dev']) {
		if (gitRefExists(candidate)) {
			return candidate;
		}
	}

	throw new Error('Unable to resolve a dev base ref. Expected one of: origin/dev, dev');
}

export function sanitizeBranchName(branchName) {
	return branchName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function readPackageJson() {
	return JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
}

export function writePackageJson(packageJson) {
	writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(packageJson, null, '\t')}\n`);
}

export function bumpVersion(version, bump) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) {
		throw new Error(`Unsupported package version format: ${version}`);
	}

	if (!BUMP_ORDER.includes(bump)) {
		throw new Error(`Unsupported bump type: ${String(bump)}. Expected one of: ${BUMP_ORDER.join(', ')}`);
	}

	const [, rawMajor, rawMinor, rawPatch] = match;
	let major = Number(rawMajor);
	let minor = Number(rawMinor);
	let patch = Number(rawPatch);

	if (bump === 'major') {
		major += 1;
		minor = 0;
		patch = 0;
	} else if (bump === 'minor') {
		minor += 1;
		patch = 0;
	} else {
		patch += 1;
	}

	return `${major}.${minor}.${patch}`;
}

export function getSectionForType(type) {
	return TYPE_TO_SECTION[type] ?? 'Other';
}

export function parseConventionalCommit(subject, body = '') {
	const match = CONVENTIONAL_COMMIT_SUBJECT.exec(subject.trim());
	if (!match?.groups) {
		return null;
	}

	const type = match.groups.type.toLowerCase();
	const scope = match.groups.scope ?? null;
	const description = match.groups.description.trim();
	const breaking = Boolean(match.groups.breaking) || /BREAKING CHANGE:/i.test(body);

	return {
		type,
		scope,
		description,
		breaking,
		section: getSectionForType(type)
	};
}

export function getBranchCommits({ baseRef }) {
	const mergeBase = git(['merge-base', baseRef, 'HEAD']);
	const raw = git(['log', '--reverse', '--format=%H%x1f%s%x1f%b%x1f%cI%x1e', `${mergeBase}..HEAD`]);
	const records = raw
		.split('\x1e')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [sha, subject, body, committedAt] = entry.split('\x1f');
			return {
				sha,
				subject: subject ?? '',
				body: body ?? '',
				committedAt: committedAt ?? '',
				committedAtMs: resolveCommittedAtMs(committedAt ?? '')
			};
		});

	return {
		mergeBase,
		commits: records
	};
}

export function buildPlanCommits(commits) {
	return commits
		.map((commit) => {
			const parsed = parseConventionalCommit(commit.subject, commit.body);
			if (!parsed) {
				return null;
			}

			return {
				sha: commit.sha,
				subject: commit.subject,
				committedAt: commit.committedAt,
				committedAtMs: resolveCommittedAtMs(commit.committedAt),
				type: parsed.type,
				scope: parsed.scope,
				description: parsed.description,
				breaking: parsed.breaking,
				section: parsed.section
			};
		})
		.filter(Boolean);
}

export function formatEntryLabel(entry) {
	if (entry.releaseNoteLabel) {
		return formatReleaseNoteAttribution(entry);
	}

	const scopePrefix = entry.scope ? `**${entry.scope}:** ` : '';
	const breakingPrefix = entry.breaking ? 'BREAKING: ' : '';
	const label = `${scopePrefix}${breakingPrefix}${entry.description}`;
	return formatReleaseNoteAttribution({
		...entry,
		releaseNoteLabel: label
	});
}

export function buildReleaseNotes({ version, entries, releaseDate = new Date() }) {
	const dateLabel = releaseDate.toISOString().slice(0, 10);
	const lines = [`## v${version} - ${dateLabel}`, ''];

	const groupedEntries = new Map(SECTION_ORDER.map((section) => [section, []]));
	for (const entry of entries) {
		const existing = groupedEntries.get(entry.section) ?? [];
		existing.push(entry);
		groupedEntries.set(entry.section, existing);
	}

	for (const section of SECTION_ORDER) {
		const sectionEntries = groupedEntries.get(section) ?? [];
		if (sectionEntries.length === 0) {
			continue;
		}

		lines.push(`### ${section}`);
		for (const entry of sectionEntries) {
			lines.push(`- ${formatEntryLabel(entry)}`);
		}
		lines.push('');
	}

	if (lines[lines.length - 1] === '') {
		lines.pop();
	}

	return `${lines.join('\n')}\n`;
}

export function updateChangelog({ version, notes }) {
	const heading = '# Changelog';
	const entry = `${notes.trim()}\n\n`;

	if (!existsSync(CHANGELOG_PATH)) {
		writeFileSync(CHANGELOG_PATH, `${heading}\n\n${entry}`);
		return;
	}

	const existing = readFileSync(CHANGELOG_PATH, 'utf8');
	if (existing.startsWith(`${heading}\n`)) {
		const remainder = existing.slice(heading.length).replace(/^\n+/, '');
		writeFileSync(CHANGELOG_PATH, `${heading}\n\n${entry}${remainder}`);
		return;
	}

	writeFileSync(CHANGELOG_PATH, `${heading}\n\n${entry}${existing}`);
}

export function readReleasePlans() {
	ensureDirectory(RELEASE_PLANS_DIR);

	const entries = [];
	for (const fileName of getTrackedPlanFileNames()) {
		const filePath = path.join(RELEASE_PLANS_DIR, fileName);
		const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
		entries.push({
			fileName,
			filePath,
			plan: parsed
		});
	}

	return entries;
}

export function getTrackedPlanFileNames() {
	if (!existsSync(RELEASE_PLANS_DIR)) {
		return [];
	}

	const entries = readdirSync(RELEASE_PLANS_DIR, { withFileTypes: true });

	return entries
		.filter((dirent) => dirent.isFile())
		.map((dirent) => dirent.name)
		.filter((fileName) => fileName.endsWith('.json'))
		.sort();
}

export function writeReleasePlanFile({ fileName, plan }) {
	ensureDirectory(RELEASE_PLANS_DIR);
	writeFileSync(path.join(RELEASE_PLANS_DIR, fileName), `${JSON.stringify(plan, null, '\t')}\n`);
}

export function removeReleasePlanFiles(planFiles) {
	for (const planFile of planFiles) {
		rmSync(planFile.filePath, { force: true });
	}

	ensureDirectory(RELEASE_PLANS_DIR);
	const gitkeepPath = path.join(RELEASE_PLANS_DIR, '.gitkeep');
	if (!existsSync(gitkeepPath)) {
		writeFileSync(gitkeepPath, '');
	}
}

export function writeReleaseNotesOutput({ version, notes }) {
	ensureDirectory(RELEASE_OUTPUT_DIR);
	const filePath = path.join(RELEASE_OUTPUT_DIR, `release-notes-v${version}.md`);
	writeFileSync(filePath, notes);
	return filePath;
}

export function resolveHighestBump(plans) {
	let highestBump = 'patch';
	for (const { plan } of plans) {
		if (!BUMP_ORDER.includes(plan.bump)) {
			throw new Error(`Unsupported release bump "${plan.bump}" in ${plan.branch ?? 'unknown branch'} plan.`);
		}

		if (BUMP_ORDER.indexOf(plan.bump) > BUMP_ORDER.indexOf(highestBump)) {
			highestBump = plan.bump;
		}
	}

	return highestBump;
}

export function aggregatePlanEntries(plans) {
	const bySha = new Map();

	for (const { plan } of plans) {
		for (const commit of plan.commits ?? []) {
			if (!bySha.has(commit.sha)) {
				bySha.set(commit.sha, commit);
			}
		}
	}

	return [...bySha.values()].sort((left, right) => {
		const committedAtComparison = compareCommittedAt(left, right);
		if (committedAtComparison === 0) {
			return left.sha.localeCompare(right.sha);
		}

		return committedAtComparison;
	});
}

export async function aggregateReleaseEntries(plans) {
	const commitEntries = aggregatePlanEntries(plans);
	const githubContext = resolveGitHubContext();
	if (!githubContext) {
		return commitEntries;
	}

	const pullRequestEntries = await resolvePullRequestEntries({
		entries: commitEntries,
		githubContext
	});
	if (pullRequestEntries.length === 0) {
		return commitEntries;
	}

	return pullRequestEntries;
}

export function writeGithubOutput(name, value) {
	const githubOutputPath = process.env.GITHUB_OUTPUT;
	if (!githubOutputPath) {
		return;
	}

	writeFileSync(githubOutputPath, `${name}=${value}\n`, {
		flag: 'a'
	});
}

function formatReleaseNoteAttribution(entry) {
	const parts = [entry.releaseNoteLabel];
	if (entry.authorLogin) {
		parts.push(`by @${entry.authorLogin}`);
	}

	if (entry.pullRequestUrl && entry.pullRequestNumber) {
		parts.push(`in [#${entry.pullRequestNumber}](${entry.pullRequestUrl})`);
	} else if (entry.pullRequestUrl) {
		parts.push(`in [pull request](${entry.pullRequestUrl})`);
	}

	return parts.join(' ');
}

function resolveGitHubContext() {
	const repository = process.env.GITHUB_REPOSITORY?.trim() ?? parseGitHubRepositoryFromOrigin();
	if (!repository || !repository.includes('/')) {
		return null;
	}

	return {
		repository,
		token: process.env.GITHUB_TOKEN?.trim() || null
	};
}

function parseGitHubRepositoryFromOrigin() {
	let remoteUrl = '';
	try {
		remoteUrl = git(['config', '--get', 'remote.origin.url']);
	} catch {
		return null;
	}

	const sshMatch = /^git@github\.com:(?<repo>.+?)(?:\.git)?$/.exec(remoteUrl);
	if (sshMatch?.groups?.repo) {
		return sshMatch.groups.repo;
	}

	const httpsMatch = /^https:\/\/github\.com\/(?<repo>.+?)(?:\.git)?$/.exec(remoteUrl);
	if (httpsMatch?.groups?.repo) {
		return httpsMatch.groups.repo;
	}

	return null;
}

async function resolvePullRequestEntries({ entries, githubContext }) {
	const results = await mapWithConcurrencyLimit(entries, 5, async (entry) => {
		const pullRequest = await fetchAssociatedPullRequest({
			sha: entry.sha,
			githubContext
		}).catch((error) => {
			console.warn(
				`Warning: unable to resolve PR metadata for commit ${entry.sha.slice(0, 7)}: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
			return null;
		});

		return {
			entry,
			pullRequest
		};
	});

	return results.map(({ entry, pullRequest }) => {
		if (!pullRequest?.number) {
			return entry;
		}

		return {
			...entry,
			pullRequestNumber: pullRequest.number,
			pullRequestUrl: pullRequest.url,
			authorLogin: pullRequest.authorLogin
		};
	});
}

async function fetchAssociatedPullRequest({ sha, githubContext }) {
	const url = `https://api.github.com/repos/${githubContext.repository}/commits/${sha}/pulls`;
	const response = await fetch(url, {
		headers: buildGitHubHeaders(githubContext.token)
	});
	if (!response.ok) {
		throw new Error(`GitHub API ${response.status} ${response.statusText}`);
	}

	const pullRequests = await response.json();
	if (!Array.isArray(pullRequests) || pullRequests.length === 0) {
		return null;
	}

	const mergedPullRequest = pullRequests.find((pullRequest) => pullRequest?.merged_at) ?? pullRequests[0];
	return {
		number: mergedPullRequest.number,
		title: mergedPullRequest.title,
		url: mergedPullRequest.html_url,
		authorLogin: mergedPullRequest.user?.login ?? null
	};
}

function buildGitHubHeaders(token) {
	const headers = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': 'arbiter-release-bot'
	};

	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	return headers;
}

function resolveCommittedAtMs(committedAt, fallback = null) {
	if (typeof fallback === 'number' && Number.isFinite(fallback)) {
		return fallback;
	}

	const parsed = Date.parse(committedAt);
	return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function compareCommittedAt(left, right) {
	const leftMs = resolveCommittedAtMs(left.committedAt, left.committedAtMs);
	const rightMs = resolveCommittedAtMs(right.committedAt, right.committedAtMs);
	return leftMs - rightMs;
}

async function mapWithConcurrencyLimit(items, concurrency, mapper) {
	const results = new Array(items.length);
	let nextIndex = 0;

	async function worker() {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			if (currentIndex >= items.length) {
				return;
			}

			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	}

	const workerCount = Math.max(1, Math.min(concurrency, items.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}
