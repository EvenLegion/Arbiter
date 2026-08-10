import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	ReleasePlanContractError,
	assertValidBranchReleasePlan,
	discoverBranchReleasePlan,
	formatInvalidPlanMessage,
	inspectBranchReleasePlan
} from '../../../scripts/release/plan-contract.mjs';
import { runReleasePlan } from '../../../scripts/release/plan-operation.mjs';
import { parsePlanArguments } from '../../../scripts/release/plan.mjs';
import { parseCheckArguments } from '../../../scripts/release/check-plan.mjs';
import { parseMigrationArguments } from '../../../scripts/release/migrate-plan.mjs';

const repositories: string[] = [];
const branch = 'codex/STE-263-release-plan-contract';
const internalClassification = {
	mode: 'internal',
	contributionSummary: 'Exercises deterministic branch-owned release-plan validation.'
};

afterEach(() => {
	for (const repository of repositories.splice(0)) {
		rmSync(repository, { recursive: true, force: true });
	}
});

describe('branch-owned release-plan contract', () => {
	it('accepts a parsed branch owner at any filename and permits later commits', () => {
		const repository = createRepository();
		writeValidPlan(repository, 'intentionally-different-name.json');
		commitFile(repository, 'docs.txt', 'later documentation\n', 'docs: explain the workflow');

		const before = git(repository, 'status', '--porcelain');
		const inspection = assertValidBranchReleasePlan({ branch, repoRoot: repository });
		const after = git(repository, 'status', '--porcelain');

		expect(inspection.entry.fileName).toBe('intentionally-different-name.json');
		expect(inspection.entry.plan.headRef).not.toBe(git(repository, 'rev-parse', 'HEAD'));
		expect(after).toBe(before);
	});

	it('reports missing, duplicate, and unreadable branch ownership distinctly', () => {
		const repository = createRepository();

		expect(() => assertValidBranchReleasePlan({ branch, repoRoot: repository })).toThrowError(
			/No release plan found whose parsed branch field equals/
		);

		writeValidPlan(repository, 'first.json');
		writeValidPlan(repository, 'second.json');
		expect(() => discoverBranchReleasePlan({ branch, repoRoot: repository })).toThrowError(/multiple release plans/);

		rmSync(path.join(repository, '.release-plans', 'second.json'));
		writeFileSync(path.join(repository, '.release-plans', 'broken.json'), '{not-json\n');
		expect(() => discoverBranchReleasePlan({ branch, repoRoot: repository })).toThrowError(/Unable to parse release plan broken.json/);
	});

	it('requires complete v2 classification in invalid-plan regeneration guidance', () => {
		const message = formatInvalidPlanMessage({
			branch,
			entry: { fileName: 'invalid.json' },
			issues: ['targetVersion is stale']
		});

		expect(message).toContain('preserving the intended v2 classification');
		expect(message).toContain('--regenerate, --reason, --bump, --mode, --summary');
		expect(message).toContain('--group, --section, or --description');
		expect(message).toContain('ai/rules/release-plans.md');
	});

	it('returns specific schema, ref, bump, version, and history failures', () => {
		const repository = createRepository();
		const entry = writeValidPlan(repository);
		const plan = readPlan(entry.filePath);
		plan.schemaVersion = 1;
		plan.baseRef = 'dev';
		plan.mergeBase = '0000000000000000000000000000000000000000';
		plan.bump = 'calendar';
		plan.targetVersion = '99.0.0';
		plan.headRef = '1111111111111111111111111111111111111111';
		plan.commits = [{ sha: '2222222222222222222222222222222222222222' }, { sha: '2222222222222222222222222222222222222222' }];
		writeFileSync(entry.filePath, `${JSON.stringify(plan, null, '\t')}\n`);

		const inspection = inspectBranchReleasePlan({ branch, repoRoot: repository });
		expect(inspection.status).toBe('invalid');
		if (inspection.status !== 'invalid') throw new Error('Expected invalid inspection.');
		expect(inspection.issues.join('\n')).toMatch(/schemaVersion must be 2/);
		expect(inspection.issues.join('\n')).toMatch(/release:plan:migrate/);
		expect(inspection.issues.join('\n')).toMatch(/baseRef must be origin\/dev/);
		expect(inspection.issues.join('\n')).toMatch(/mergeBase is stale/);
		expect(inspection.issues.join('\n')).toMatch(/bump must be one of patch, minor, major/);
		expect(inspection.issues.join('\n')).toMatch(/headRef .* is not a reachable commit/);
		expect(inspection.issues.join('\n')).toMatch(/commits\[0\].sha .* is not a reachable commit/);
		expect(inspection.issues.join('\n')).toMatch(/duplicate SHA/);
	});

	it('rejects a target version that does not match an otherwise valid bump', () => {
		const repository = createRepository();
		const entry = writeValidPlan(repository);
		const plan = readPlan(entry.filePath);
		plan.targetVersion = '3.4.0';
		writeFileSync(entry.filePath, `${JSON.stringify(plan, null, '\t')}\n`);

		const inspection = inspectBranchReleasePlan({ branch, repoRoot: repository });
		expect(inspection.status).toBe('invalid');
		if (inspection.status !== 'invalid') throw new Error('Expected invalid inspection.');
		expect(inspection.issues).toContain('targetVersion must be 3.3.1 for package 3.3.0 and a patch bump; received 3.4.0');
	});

	it('refuses validation against any base other than origin/dev', () => {
		const repository = createRepository();
		writeValidPlan(repository);

		expect(() => inspectBranchReleasePlan({ branch, baseRef: 'dev', repoRoot: repository })).toThrowError(
			/Release plans must be validated against origin\/dev/
		);
	});

	it('requires immutable full commit IDs and complete publishable entries', () => {
		const repository = createRepository();
		const entry = writeValidPlan(repository);
		const plan = readPlan(entry.filePath);
		plan.headRef = 'HEAD';
		plan.commits[0].sha = 'HEAD';
		plan.commits[0].description = '';
		plan.commits[0].section = 'Unknown';
		writeFileSync(entry.filePath, `${JSON.stringify(plan, null, '\t')}\n`);

		const inspection = inspectBranchReleasePlan({ branch, repoRoot: repository });
		expect(inspection.status).toBe('invalid');
		if (inspection.status !== 'invalid') throw new Error('Expected invalid inspection.');
		expect(inspection.issues).toContain('headRef must be a full 40-character commit SHA; received HEAD');
		expect(inspection.issues).toContain('commits[0].sha must be a full 40-character commit SHA; received HEAD');
		expect(inspection.issues).toContain('commits[0].description must be a non-empty string');
		expect(inspection.issues).toContain(
			'commits[0].section must be one of Features, Fixes, Performance, Refactors, Maintenance, Other; received Unknown'
		);
	});

	it('rejects duplicate commit IDs written with different casing', () => {
		const repository = createRepository();
		const entry = writeValidPlan(repository);
		const plan = readPlan(entry.filePath);
		plan.commits.push({ ...plan.commits[0], sha: plan.commits[0].sha.toUpperCase() });
		writeFileSync(entry.filePath, `${JSON.stringify(plan, null, '\t')}\n`);

		const inspection = inspectBranchReleasePlan({ branch, repoRoot: repository });
		expect(inspection.status).toBe('invalid');
		if (inspection.status !== 'invalid') throw new Error('Expected invalid inspection.');
		expect(inspection.issues).toContain(`commits contains duplicate SHA ${plan.commits[0].sha.toUpperCase()}`);
	});

	it('preserves the contract error when Git cannot be started', () => {
		const repository = createRepository();
		writeValidPlan(repository);
		const originalPath = process.env.PATH;
		process.env.PATH = '';
		expect.assertions(2);

		try {
			inspectBranchReleasePlan({ branch, repoRoot: repository });
		} catch (error) {
			expect(error).toBeInstanceOf(ReleasePlanContractError);
			expect((error as ReleasePlanContractError).code).toBe('GIT_CONTEXT_ERROR');
		} finally {
			process.env.PATH = originalPath;
		}
	});

	it('rejects a recorded head after the branch history is rewritten', () => {
		const repository = createRepository();
		const recordedHead = git(repository, 'rev-parse', 'HEAD');
		writeValidPlan(repository);
		const mergeBase = git(repository, 'merge-base', 'origin/dev', 'HEAD');
		git(repository, 'reset', '--hard', mergeBase);
		commitFile(repository, 'replacement.txt', 'replacement\n', 'fix: replace branch history');

		const inspection = inspectBranchReleasePlan({ branch, repoRoot: repository });
		expect(inspection.status).toBe('invalid');
		if (inspection.status !== 'invalid') throw new Error('Expected invalid inspection.');
		expect(inspection.issues).toContain(`headRef ${recordedHead} is not an ancestor of HEAD; the branch was likely rebased or rewritten`);
	});
});

describe('release-plan operation', () => {
	it('accepts the pnpm argument separator for documented noninteractive commands', () => {
		expect(parsePlanArguments(['--', '--bump', 'patch'])).toEqual({
			bump: 'patch',
			mode: null,
			group: null,
			description: null,
			section: null,
			contributionSummary: null,
			regenerate: false,
			reason: null
		});
		expect(parseCheckArguments(['--', '--branch', branch, '--base', 'origin/dev'])).toMatchObject({
			branch,
			baseRef: 'origin/dev',
			headRef: 'HEAD'
		});
		expect(
			parsePlanArguments([
				'--',
				'--bump',
				'minor',
				'--mode',
				'publish',
				'--group',
				'member-directory',
				'--section',
				'Features',
				'--description',
				'Approved tools can read the member directory.',
				'--summary',
				'Publishes the completed member directory.'
			])
		).toMatchObject({
			bump: 'minor',
			mode: 'publish',
			group: 'member-directory',
			section: 'Features',
			description: 'Approved tools can read the member directory.',
			contributionSummary: 'Publishes the completed member directory.'
		});
		expect(
			parseMigrationArguments(['--', '--file', 'legacy.json', '--mode', 'internal', '--summary', 'Preserves an internal contribution.'])
		).toMatchObject({
			fileName: 'legacy.json',
			mode: 'internal',
			contributionSummary: 'Preserves an internal contribution.'
		});
	});

	it('creates once with an explicit bump and then reuses without mutation', async () => {
		const repository = createRepository();
		const created = await runReleasePlan({ repoRoot: repository, bump: 'patch', ...internalClassification, log: () => undefined });
		const headAfterCreate = git(repository, 'rev-parse', 'HEAD');
		const filePath = path.join(repository, '.release-plans', created.fileName);
		const contentAfterCreate = readFileSync(filePath, 'utf8');

		const reused = await runReleasePlan({ repoRoot: repository, bump: 'patch', ...internalClassification, log: () => undefined });

		expect(created.status).toBe('created');
		expect(reused.status).toBe('reused');
		expect(git(repository, 'rev-parse', 'HEAD')).toBe(headAfterCreate);
		expect(readFileSync(filePath, 'utf8')).toBe(contentAfterCreate);
		expect(git(repository, 'status', '--porcelain')).toBe('');
		expect(assertValidBranchReleasePlan({ branch, repoRoot: repository }).status).toBe('valid');
	});

	it('fails noninteractive creation without a bump', async () => {
		const repository = createRepository();
		await expect(runReleasePlan({ repoRoot: repository, log: () => undefined })).rejects.toThrowError(
			/Noninteractive release-plan creation requires --bump/
		);
	});

	it('requires a reason and replaces only the invalid matching plan during regeneration', async () => {
		const repository = createRepository();
		const created = await runReleasePlan({ repoRoot: repository, bump: 'patch', ...internalClassification, log: () => undefined });
		const filePath = path.join(repository, '.release-plans', created.fileName);
		const plan = readPlan(filePath);
		plan.targetVersion = '99.0.0';
		writeFileSync(filePath, `${JSON.stringify(plan, null, '\t')}\n`);
		git(repository, 'add', '--', `.release-plans/${created.fileName}`);
		git(repository, 'commit', '-m', 'test: invalidate the release plan fixture');

		await expect(runReleasePlan({ repoRoot: repository, bump: 'patch', regenerate: true, log: () => undefined })).rejects.toThrowError(
			/requires --reason/
		);

		const regenerated = await runReleasePlan({
			repoRoot: repository,
			bump: 'patch',
			...internalClassification,
			regenerate: true,
			reason: 'the target version was corrupted in the plan fixture',
			log: () => undefined
		});

		expect(regenerated.status).toBe('regenerated');
		expect(regenerated.fileName).toBe(created.fileName);
		expect(discoverBranchReleasePlan({ branch, repoRoot: repository }).status).toBe('found');
		expect(assertValidBranchReleasePlan({ branch, repoRoot: repository }).status).toBe('valid');
		expect(git(repository, 'status', '--porcelain')).toBe('');
	});

	it('does not overwrite a canonical filename owned by another branch', async () => {
		const repository = createRepository();
		const entry = writeValidPlan(repository, 'codex-STE-263-release-plan-contract.json');
		const plan = readPlan(entry.filePath);
		plan.branch = 'codex/someone-else';
		writeFileSync(entry.filePath, `${JSON.stringify(plan, null, '\t')}\n`);

		await expect(runReleasePlan({ repoRoot: repository, bump: 'patch', ...internalClassification, log: () => undefined })).rejects.toThrowError(
			/expected filename .* already records branch codex\/someone-else/
		);
	});

	it('surfaces contract error codes for automation', () => {
		const repository = createRepository();
		expect.assertions(2);
		try {
			assertValidBranchReleasePlan({ branch, repoRoot: repository });
		} catch (error) {
			expect(error).toBeInstanceOf(ReleasePlanContractError);
			expect((error as ReleasePlanContractError).code).toBe('MISSING_BRANCH_PLAN');
		}
	});
});

function createRepository() {
	const repository = mkdtempSync(path.join(tmpdir(), 'arbiter-release-plan-'));
	repositories.push(repository);
	git(repository, 'init', '--initial-branch=dev');
	git(repository, 'config', 'user.name', 'Release Plan Test');
	git(repository, 'config', 'user.email', 'release-plan@example.com');
	git(repository, 'config', 'commit.gpgsign', 'false');
	mkdirSync(path.join(repository, '.release-plans'));
	writeFileSync(path.join(repository, 'package.json'), '{"name":"fixture","version":"3.3.0"}\n');
	git(repository, 'add', '.');
	git(repository, 'commit', '-m', 'chore: establish release baseline');
	git(repository, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
	git(repository, 'checkout', '--quiet', '-b', branch);
	commitFile(repository, 'feature.txt', 'feature\n', 'feat: add release-plan enforcement');
	return repository;
}

function writeValidPlan(repository: string, fileName = 'branch-plan.json') {
	const headRef = git(repository, 'rev-parse', 'HEAD');
	const mergeBase = git(repository, 'merge-base', 'origin/dev', 'HEAD');
	const plan = {
		schemaVersion: 2,
		branch,
		baseRef: 'origin/dev',
		mergeBase,
		headRef,
		generatedAt: new Date().toISOString(),
		bump: 'patch',
		targetVersion: '3.3.1',
		contributionSummary: internalClassification.contributionSummary,
		publicNote: {
			mode: 'internal'
		},
		commits: [
			{
				sha: headRef,
				subject: 'feat: add release-plan enforcement',
				committedAt: new Date().toISOString(),
				committedAtMs: Date.now(),
				type: 'feat',
				scope: null,
				description: 'add release-plan enforcement',
				breaking: false,
				section: 'Features'
			}
		]
	};
	const filePath = path.join(repository, '.release-plans', fileName);
	writeFileSync(filePath, `${JSON.stringify(plan, null, '\t')}\n`);
	return { fileName, filePath, plan };
}

function readPlan(filePath: string) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function commitFile(repository: string, fileName: string, content: string, subject: string) {
	writeFileSync(path.join(repository, fileName), content);
	git(repository, 'add', '--', fileName);
	git(repository, 'commit', '-m', subject);
}

function git(repository: string, ...args: string[]) {
	return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
}
