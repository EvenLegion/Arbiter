import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { refreshHotfix } from '../../../scripts/release/hotfix-refresh.mjs';
import { runReleasePublish } from '../../../scripts/release/release-operation.mjs';
import { checkHotfix } from '../../../scripts/release/hotfix-check.mjs';
import { parseCheckArguments } from '../../../scripts/release/check-plan.mjs';
import { runReleasePlan } from '../../../scripts/release/plan-operation.mjs';
const roots: string[] = [];
const branch = 'hotfix/incident';
function fixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'arbiter-hotfix-'));
	roots.push(root);
	const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	git('init', '-b', 'main');
	git('config', 'user.name', 'Test');
	git('config', 'user.email', 'test@example.com');
	writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '3.5.0' }));
	git('add', '.');
	git('commit', '-m', 'chore: base');
	git('update-ref', 'refs/remotes/origin/main', 'HEAD');
	git('switch', '-c', 'dev');
	writeFileSync(path.join(root, 'unreleased.txt'), 'merits');
	git('add', '.');
	git('commit', '-m', 'feat: unreleased merits');
	git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
	git('switch', '-c', branch, 'main');
	writeFileSync(path.join(root, 'fix.txt'), 'fix');
	git('add', '.');
	git('commit', '-m', 'fix: event recovery');
	return { root, git };
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it('plans an isolated patch against main and rejects minor bumps', async () => {
	const { root } = fixture();
	await expect(runReleasePlan({ repoRoot: root, bump: 'minor', mode: 'internal', contributionSummary: 'Fix' })).rejects.toThrow(/patch bump/);
	const result = await runReleasePlan({ repoRoot: root, bump: 'patch', mode: 'internal', contributionSummary: 'Fix', log: () => {} });
	expect(result.plan.baseRef).toBe('origin/main');
	expect(checkHotfix({ repoRoot: root, branch })).toEqual({ state: 'pending', version: '3.5.1' });
	expect(() => checkHotfix({ repoRoot: root, branch, preparedOnly: true })).toThrow(/not been prepared/);
});
it('rejects unreleased dev ancestry even when the branch is named hotfix', () => {
	const { root, git } = fixture();
	git('merge', 'dev', '--no-edit');
	expect(() => checkHotfix({ repoRoot: root, branch })).toThrow(/unreleased dev history/);
});
it('requires prepared version, notes and hotfix-only provenance', () => {
	const { root } = fixture();
	expect(() => checkHotfix({ repoRoot: root, branch })).toThrow(/exactly one patch/);
	writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '3.5.1' }));
	const output = path.join(root, '.release-output');
	mkdirSync(output);
	writeFileSync(path.join(output, 'release-notes-v3.5.1.md'), 'Event recovery fix');
	const provenance = path.join(output, 'release-provenance-v3.5.1.json');
	writeFileSync(provenance, JSON.stringify({ releaseVersion: '3.5.1', plans: [{ branch, bump: 'patch' }] }));
	expect(() => checkHotfix({ repoRoot: root, branch, preparedOnly: true })).toThrow(/complete source plan/);
	writeFileSync(provenance, JSON.stringify({ releaseVersion: '3.5.1', plans: [{ branch: 'dev', bump: 'patch' }] }));
	expect(() => checkHotfix({ repoRoot: root, branch })).toThrow(/only this hotfix/);
});

it('defers the default check base until the branch is resolved', () => {
	expect(parseCheckArguments([]).baseRef).toBeNull();
});

it('accepts actual generated artifacts and rejects edited metadata, notes and changelog', async () => {
	const { root } = fixture();
	await runReleasePlan({ repoRoot: root, bump: 'patch', mode: 'internal', contributionSummary: 'Fix', log: () => {} });
	await runReleasePublish({ repoRoot: root, attributions: new Map(), log: () => {}, writeOutput: () => {} });
	expect(checkHotfix({ repoRoot: root, branch, preparedOnly: true }).state).toBe('prepared');
	const output = path.join(root, '.release-output');
	const provenance = path.join(output, 'release-provenance-v3.5.1.json');
	const original = readFileSync(provenance, 'utf8');
	const broken = JSON.parse(original);
	broken.plans[0].sourcePlan.headRef = '0'.repeat(40);
	writeFileSync(provenance, JSON.stringify(broken));
	expect(() => checkHotfix({ repoRoot: root, branch })).toThrow(/Invalid prepared source plan/);
	writeFileSync(provenance, original);
	const notes = path.join(output, 'release-notes-v3.5.1.md');
	const text = readFileSync(notes, 'utf8');
	writeFileSync(notes, text + 'Invented note');
	expect(() => checkHotfix({ repoRoot: root, branch })).toThrow(/differ from/);
	writeFileSync(notes, text);
	writeFileSync(path.join(root, 'CHANGELOG.md'), 'old changelog');
	expect(() => checkHotfix({ repoRoot: root, branch })).toThrow(/Changelog/);
});

it('refreshes prepared artifacts for the same patch without touching application code', async () => {
	const { root, git } = fixture();
	await runReleasePlan({ repoRoot: root, bump: 'patch', mode: 'internal', contributionSummary: 'Fix', log: () => {} });
	await runReleasePublish({ repoRoot: root, attributions: new Map(), log: () => {}, writeOutput: () => {} });
	git('add', '.');
	git('commit', '-m', 'chore(release): prepare v3.5.1');
	writeFileSync(path.join(root, 'fix.txt'), 'review correction');
	git('add', '.');
	git('commit', '-m', 'fix: review correction');
	expect(checkHotfix({ repoRoot: root, branch }).state).toBe('prepared');
	refreshHotfix({ repoRoot: root, branch });
	expect(readFileSync(path.join(root, 'fix.txt'), 'utf8')).toBe('review correction');
	expect(checkHotfix({ repoRoot: root, branch })).toEqual({ state: 'pending', version: '3.5.1' });
	git('add', '.');
	git('commit', '-m', 'chore(release): reset artifacts');
	await runReleasePlan({
		repoRoot: root,
		bump: 'patch',
		mode: 'internal',
		contributionSummary: 'Updated fix',
		regenerate: true,
		reason: 'updated scope',
		log: () => {}
	});
	await runReleasePublish({ repoRoot: root, attributions: new Map(), log: () => {}, writeOutput: () => {} });
	expect(checkHotfix({ repoRoot: root, branch })).toEqual({ state: 'prepared', version: '3.5.1' });
});

it.each(['squash', 'rebase'])('validates immutable source plus identical merged tree after %s', async (method) => {
	const { root, git } = fixture();
	await runReleasePlan({ repoRoot: root, bump: 'patch', mode: 'internal', contributionSummary: 'Fix', log: () => {} });
	await runReleasePublish({ repoRoot: root, attributions: new Map(), log: () => {}, writeOutput: () => {} });
	git('add', '.');
	git('commit', '-m', 'chore(release): prepare v3.5.1');
	const source = git('rev-parse', 'HEAD');
	const base = git('rev-parse', 'main');
	// commit-tree models a rewritten merge SHA independent of source ancestry.
	const merged = git('commit-tree', `${source}^{tree}`, '-p', base, '-m', `${method} merge`);
	git('checkout', '--detach', merged);
	expect(checkHotfix({ repoRoot: root, branch, base, headRef: source, preparedOnly: true }).state).toBe('prepared');
	writeFileSync(path.join(root, 'fix.txt'), 'unexpected merged change');
	git('add', '.');
	git('commit', '-m', 'fix: changed merged tree');
	expect(() => checkHotfix({ repoRoot: root, branch, base, headRef: source, preparedOnly: true })).toThrow();
});

it.each([false, true])('resets old preparation before integrating advanced main (released=%s)', async (released) => {
	const { root, git } = fixture();
	await runReleasePlan({ repoRoot: root, bump: 'patch', mode: 'internal', contributionSummary: 'Fix', log: () => {} });
	await runReleasePublish({ repoRoot: root, attributions: new Map(), log: () => {}, writeOutput: () => {} });
	git('add', '.');
	git('commit', '-m', 'chore(release): prepare v3.5.1');
	git('switch', 'main');
	writeFileSync(path.join(root, 'new-main.txt'), 'main moved');
	if (released) writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '3.5.1' }));
	git('add', '.');
	git('commit', '-m', 'chore: advance main');
	git('update-ref', 'refs/remotes/origin/main', 'HEAD');
	git('switch', branch);
	expect(() => checkHotfix({ repoRoot: root, branch })).toThrow(/current main base/);
	refreshHotfix({ repoRoot: root, branch });
	git('add', '.');
	git('commit', '-m', 'chore(release): reset artifacts');
	try {
		git('merge', 'main', '--no-edit');
	} catch (error) {
		if (!released) throw error;
		// Resolve the expected version-file conflict to the newly released main version.
		writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '3.5.1' }));
		git('add', 'package.json');
		git('commit', '--no-edit');
	}
	await runReleasePlan({
		repoRoot: root,
		bump: 'patch',
		mode: 'internal',
		contributionSummary: 'Fix',
		regenerate: true,
		reason: 'main advanced',
		log: () => {}
	});
	await runReleasePublish({ repoRoot: root, attributions: new Map(), log: () => {}, writeOutput: () => {} });
	expect(checkHotfix({ repoRoot: root, branch })).toEqual({ state: 'prepared', version: released ? '3.5.2' : '3.5.1' });
});
