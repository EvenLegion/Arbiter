import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectReleasePlanStructureIssues } from '../../../scripts/release/plan-contract.mjs';
import { collectReleaseAggregationIssues, prepareReleasePreview } from '../../../scripts/release/release-aggregation.mjs';
import { runReleasePlanMigration } from '../../../scripts/release/plan-migration.mjs';
import { runReleasePreview, runReleasePublish } from '../../../scripts/release/release-operation.mjs';

const repositories: string[] = [];
const releaseDate = new Date('2026-08-10T12:00:00.000Z');

afterEach(() => {
	for (const repository of repositories.splice(0)) {
		rmSync(repository, { recursive: true, force: true });
	}
});

describe('release-plan public-note contract', () => {
	it.each([
		['standalone', { description: 'Members can use one complete capability.', section: 'Features' }],
		['contribute', { group: 'member-directory', section: 'Features' }],
		['publish', { group: 'member-directory', description: 'Approved tools can read the member directory.', section: 'Features' }],
		['internal', {}]
	])('accepts %s mode with its required fields', (mode, fields) => {
		const entry = makePlan('mode.json', { mode, ...fields });
		expect(collectReleasePlanStructureIssues({ plan: entry.plan, fileName: entry.fileName })).toEqual([]);
	});

	it('rejects unknown modes and invalid group, description, and section combinations', () => {
		const invalidPlans = [
			makePlan('unknown.json', { mode: 'automatic' }),
			makePlan('bad-group.json', { mode: 'contribute', group: 'Member Directory', section: 'Features' }),
			makePlan('missing-description.json', { mode: 'publish', group: 'member-directory', section: 'Features' }),
			makePlan('internal-description.json', { mode: 'internal', description: 'Do not publish this.' }),
			makePlan('standalone-group.json', {
				mode: 'standalone',
				group: 'member-directory',
				description: 'One note.',
				section: 'Features'
			})
		];

		const issues = invalidPlans.flatMap((entry) => collectReleasePlanStructureIssues({ plan: entry.plan, fileName: entry.fileName }));
		expect(issues.join('\n')).toMatch(/publicNote.mode must be one of standalone, contribute, publish, internal/);
		expect(issues.join('\n')).toMatch(/stable lowercase kebab-case identifier/);
		expect(issues.join('\n')).toMatch(/description must be a non-empty public description/);
		expect(issues.join('\n')).toMatch(/description must be absent for internal/);
		expect(issues.join('\n')).toMatch(/group must be absent for standalone/);
	});

	it('reports missing publishers, duplicate publishers, and conflicting group metadata with named plans', () => {
		const missingPublisher = [makePlan('contribute.json', { mode: 'contribute', group: 'member-directory', section: 'Features' })];
		expect(collectReleaseAggregationIssues(missingPublisher).join('\n')).toMatch(
			/group member-directory has contributing plans \(contribute.json\) but no publish plan/
		);

		const duplicatePublisher = [
			makePlan('publish-a.json', {
				mode: 'publish',
				group: 'member-directory',
				description: 'First description.',
				section: 'Features'
			}),
			makePlan('publish-b.json', {
				mode: 'publish',
				group: 'member-directory',
				description: 'Second description.',
				section: 'Fixes'
			})
		];
		const issues = collectReleaseAggregationIssues(duplicatePublisher).join('\n');
		expect(issues).toMatch(/multiple publish plans: publish-a.json, publish-b.json/);
		expect(issues).toMatch(/conflicting publicNote.section metadata/);
		expect(issues).toMatch(/Features: publish-a.json/);
		expect(issues).toMatch(/Fixes: publish-b.json/);
	});
});

describe('consolidated release preview', () => {
	it('consolidates the staged API MVP into two public notes while retaining all provenance', () => {
		const plans = [
			makePlan('ste-294.json', { mode: 'contribute', group: 'member-directory', section: 'Features', bump: 'patch', minute: 1 }),
			makePlan('ste-295.json', { mode: 'contribute', group: 'member-directory', section: 'Features', bump: 'patch', minute: 2 }),
			makePlan('ste-296.json', { mode: 'contribute', group: 'member-directory', section: 'Features', bump: 'patch', minute: 3 }),
			makePlan('ste-297.json', { mode: 'contribute', group: 'staff-website', section: 'Features', bump: 'patch', minute: 4 }),
			makePlan('ste-298.json', {
				mode: 'publish',
				group: 'member-directory',
				description:
					"Approved Even Legion tools can read Arbiter's member directory, including division memberships, merit totals, and ranks, with safe filtering and usage limits.",
				section: 'Features',
				bump: 'patch',
				minute: 5
			}),
			makePlan('ste-299.json', {
				mode: 'publish',
				group: 'staff-website',
				description:
					"Authorized staff can sign in to Arbiter's website with Discord and manage which approved tools can access the member directory.",
				section: 'Features',
				bump: 'patch',
				minute: 6
			}),
			makePlan('ste-300.json', { mode: 'internal', bump: 'minor', minute: 7 })
		];
		const attributions = attributionMap(plans);
		const preview = prepareReleasePreview({ plans, packageVersion: '3.4.0', releaseDate, attributions });

		expect(preview.version).toBe('3.5.0');
		expect(preview.entries).toHaveLength(2);
		expect(preview.entries.map((entry) => entry.group)).toEqual(['member-directory', 'staff-website']);
		expect(preview.notes.match(/^- /gm)).toHaveLength(2);
		expect(preview.notes).toContain('member directory');
		expect(preview.notes).toContain('Authorized staff can sign in');
		expect(preview.notes).not.toContain('**api:**');
		expect(preview.notes).not.toContain('internal contribution from ste-300.json');
		expect(preview.provenance.plans).toHaveLength(7);
		expect(preview.provenance.plans.flatMap((plan) => plan.commits)).toHaveLength(7);
		expect(preview.provenance.publicNotes).toHaveLength(2);
		expect(preview.provenance.publicNotes[0].pullRequests).toHaveLength(4);
		expect(preview.provenance.publicNotes[0].contributors).toEqual(['contributor1', 'contributor2', 'contributor3', 'contributor5']);
		expect(preview.provenance.plans.find((plan) => plan.fileName === 'ste-300.json')?.publicNote.mode).toBe('internal');
	});

	it('supports internal-only releases and mixed standalone plus grouped notes without inventing copy', () => {
		const internalOnly = [makePlan('internal-only.json', { mode: 'internal', bump: 'minor', minute: 1 })];
		const internalPreview = prepareReleasePreview({ plans: internalOnly, packageVersion: '3.4.0', releaseDate });
		expect(internalPreview.version).toBe('3.5.0');
		expect(internalPreview.entries).toEqual([]);
		expect(internalPreview.notes).toBe('## v3.5.0 - 2026-08-10\n');

		const mixedPlans = [
			makePlan('standalone.json', {
				mode: 'standalone',
				description: 'Members can use an independently complete capability.',
				section: 'Features',
				minute: 1
			}),
			makePlan('contribute.json', { mode: 'contribute', group: 'event-review', section: 'Features', minute: 2 }),
			makePlan('publish.json', {
				mode: 'publish',
				group: 'event-review',
				description: 'Staff can complete event review with one consolidated outcome.',
				section: 'Features',
				minute: 3
			})
		];
		const mixedPreview = prepareReleasePreview({ plans: mixedPlans, packageVersion: '3.4.0', releaseDate });
		expect(mixedPreview.entries.map((entry) => entry.key)).toEqual(['standalone:standalone.json', 'group:event-review']);
		expect(mixedPreview.notes.match(/^- /gm)).toHaveLength(2);
	});

	it('uses the same validated preview for read-only rendering and mutating publication', async () => {
		const repository = createReleaseRepository();
		const plans = [
			makePlan('standalone.json', {
				mode: 'standalone',
				description: 'Members can now see one complete release outcome.',
				section: 'Features',
				bump: 'patch',
				minute: 1
			}),
			makePlan('internal.json', { mode: 'internal', bump: 'minor', minute: 2 })
		];
		writePlans(repository, plans);
		git(repository, 'add', '.');
		git(repository, 'commit', '-m', 'test: add pending release plans');
		const attributions = attributionMap(plans);

		const beforeStatus = git(repository, 'status', '--porcelain');
		const preview = await runReleasePreview({ repoRoot: repository, releaseDate, attributions });
		const afterStatus = git(repository, 'status', '--porcelain');
		expect(preview.status).toBe('ready');
		expect(afterStatus).toBe(beforeStatus);

		const published = await runReleasePublish({ repoRoot: repository, releaseDate, attributions, log: () => undefined });
		expect(published.status).toBe('published');
		expect(readFileSync(path.join(repository, '.release-output', 'release-notes-v3.5.0.md'), 'utf8')).toBe(preview.notes);
		expect(JSON.parse(readFileSync(path.join(repository, '.release-output', 'release-provenance-v3.5.0.json'), 'utf8'))).toEqual(
			preview.provenance
		);
		expect(readFileSync(path.join(repository, 'package.json'), 'utf8')).toContain('"version": "3.5.0"');
		expect(readFileSync(path.join(repository, 'CHANGELOG.md'), 'utf8')).toContain(preview.notes.trim());
		expect(() => readFileSync(path.join(repository, '.release-plans', 'standalone.json'))).toThrow();
		expect(() => readFileSync(path.join(repository, '.release-plans', 'internal.json'))).toThrow();
	});
});

describe('legacy plan migration', () => {
	it('fails release aggregation with an explicit migration instruction instead of inferring legacy behavior', () => {
		const entry = makePlan('legacy.json', { mode: 'internal' });
		entry.plan.schemaVersion = 1;
		const issues = collectReleaseAggregationIssues([entry]).join('\n');
		expect(issues).toMatch(/schemaVersion must be 2; received 1/);
		expect(issues).toMatch(/release:plan:migrate/);
	});

	it('requires explicit classification and preserves commit provenance while removing the legacy public label', () => {
		const repository = createReleaseRepository();
		const entry = makePlan('legacy.json', {
			mode: 'standalone',
			description: 'Legacy public copy.',
			section: 'Features'
		});
		const legacyPlan = {
			schemaVersion: 1,
			branch: entry.plan.branch,
			baseRef: entry.plan.baseRef,
			mergeBase: entry.plan.mergeBase,
			headRef: entry.plan.headRef,
			generatedAt: entry.plan.generatedAt,
			bump: entry.plan.bump,
			targetVersion: entry.plan.targetVersion,
			commits: entry.plan.commits.map((commit) => ({ ...commit, releaseNoteLabel: 'Legacy public copy.' }))
		};
		writeFileSync(path.join(repository, '.release-plans', entry.fileName), `${JSON.stringify(legacyPlan, null, '\t')}\n`);

		const originalCommit = { ...legacyPlan.commits[0] };
		const migrated = runReleasePlanMigration({
			repoRoot: repository,
			fileName: 'legacy.json',
			mode: 'publish',
			group: 'member-directory',
			description: 'Approved tools can read current member information.',
			section: 'Features',
			contributionSummary: 'Adds the final member-directory capability.'
		});

		expect(migrated.schemaVersion).toBe(2);
		expect(migrated.publicNote).toEqual({
			mode: 'publish',
			group: 'member-directory',
			description: 'Approved tools can read current member information.',
			section: 'Features'
		});
		expect(migrated.commits[0]).toEqual(
			expect.objectContaining({
				sha: originalCommit.sha,
				subject: originalCommit.subject,
				committedAt: originalCommit.committedAt
			})
		);
		expect(migrated.commits[0]).not.toHaveProperty('releaseNoteLabel');
	});
});

function makePlan(
	fileName: string,
	options: {
		mode: string;
		group?: string;
		description?: string;
		section?: string;
		bump?: string;
		minute?: number;
	}
) {
	const numericId = Number(fileName.match(/\d+/)?.[0] ?? options.minute ?? 1);
	const sha = numericId.toString(16).padStart(40, '0').slice(-40);
	const minute = options.minute ?? numericId % 60;
	const publicNote: Record<string, string> = { mode: options.mode };
	if (options.group !== undefined) publicNote.group = options.group;
	if (options.description !== undefined) publicNote.description = options.description;
	if (options.section !== undefined) publicNote.section = options.section;
	return {
		fileName,
		filePath: `/fixture/.release-plans/${fileName}`,
		plan: {
			schemaVersion: 2,
			branch: `codex/${fileName.replace('.json', '')}`,
			baseRef: 'origin/dev',
			mergeBase: 'f'.repeat(40),
			headRef: sha,
			generatedAt: '2026-08-10T00:00:00.000Z',
			bump: options.bump ?? 'patch',
			targetVersion: options.bump === 'minor' ? '3.5.0' : '3.4.1',
			contributionSummary: `Internal contribution from ${fileName}.`,
			publicNote,
			commits: [
				{
					sha,
					subject: `feat: implement ${fileName}`,
					committedAt: `2026-08-10T00:${String(minute).padStart(2, '0')}:00.000Z`,
					committedAtMs: Date.parse(`2026-08-10T00:${String(minute).padStart(2, '0')}:00.000Z`),
					type: 'feat',
					scope: null,
					description: `Implement ${fileName}.`,
					breaking: false,
					section: 'Features'
				}
			]
		}
	};
}

function attributionMap(plans: ReturnType<typeof makePlan>[]) {
	return new Map(
		plans.map((entry, index) => {
			const commit = entry.plan.commits[0];
			return [
				commit.sha.toLowerCase(),
				{
					...commit,
					pullRequestNumber: 100 + index,
					pullRequestUrl: `https://github.com/EvenLegion/Arbiter/pull/${100 + index}`,
					authorLogin: `contributor${index + 1}`
				}
			];
		})
	);
}

function createReleaseRepository() {
	const repository = mkdtempSync(path.join(tmpdir(), 'arbiter-release-aggregation-'));
	repositories.push(repository);
	mkdirSync(path.join(repository, '.release-plans'));
	writeFileSync(path.join(repository, '.release-plans', '.gitkeep'), '');
	writeFileSync(path.join(repository, 'package.json'), '{"name":"fixture","version":"3.4.0"}\n');
	writeFileSync(path.join(repository, 'CHANGELOG.md'), '# Changelog\n');
	git(repository, 'init', '--initial-branch=dev');
	git(repository, 'config', 'user.name', 'Release Aggregation Test');
	git(repository, 'config', 'user.email', 'release-aggregation@example.com');
	git(repository, 'config', 'commit.gpgsign', 'false');
	git(repository, 'add', '.');
	git(repository, 'commit', '-m', 'chore: establish release fixture');
	return repository;
}

function writePlans(repository: string, plans: ReturnType<typeof makePlan>[]) {
	for (const entry of plans) {
		const filePath = path.join(repository, '.release-plans', entry.fileName);
		entry.filePath = filePath;
		writeFileSync(filePath, `${JSON.stringify(entry.plan, null, '\t')}\n`);
	}
}

function git(repository: string, ...args: string[]) {
	return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
}
