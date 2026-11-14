import { isDeepStrictEqual } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, git, readReleasePlans, readPackageJson, bumpVersion } from './lib.mjs';
import { assertValidBranchReleasePlan, collectReleasePlanIssues } from './plan-contract.mjs';

import { prepareReleasePreview } from './release-aggregation.mjs';

// Read-only: validate scope before preparation, CI, or publication. This never
// fetches, tags, publishes, operates production, or posts to Discord.
export function checkHotfix({ repoRoot = REPO_ROOT, branch, base = 'origin/main', headRef = 'HEAD', preparedOnly = false } = {}) {
	if (!/^hotfix\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch || '')) throw new Error('Expected a hotfix/* source branch.');
	if (headRef !== 'HEAD') git(['diff', '--exit-code', `${headRef}^{tree}`, 'HEAD^{tree}'], { repoRoot });
	const baseSha = git(['rev-parse', `${base}^{commit}`], { repoRoot });
	if (git(['merge-base', baseSha, headRef], { repoRoot }) !== baseSha)
		throw new Error('Hotfix must descend from the current main base; update and revalidate it first.');
	const devOnly = new Set(
		git(['rev-list', 'origin/dev', `^${baseSha}`], { repoRoot })
			.split('\n')
			.filter(Boolean)
	);
	const contamination = git(['rev-list', headRef, `^${baseSha}`], { repoRoot })
		.split('\n')
		.filter((sha) => devOnly.has(sha));
	if (contamination.length) throw new Error('Hotfix contains unreleased dev history. Backport only the approved changes onto main.');
	const baseVersion = JSON.parse(git(['show', `${baseSha}:package.json`], { repoRoot })).version;
	const expectedVersion = bumpVersion(baseVersion, 'patch');
	const plans = readReleasePlans({ repoRoot });
	if (plans.length) {
		if (preparedOnly) throw new Error('Hotfix release artifacts have not been prepared.');
		if (plans.length !== 1 || plans[0].plan.branch !== branch || plans[0].plan.bump !== 'patch')
			throw new Error('Hotfix must contain exactly its own patch release plan.');
		assertValidBranchReleasePlan({ repoRoot, branch, baseRef: 'origin/main' });
		if (readPackageJson({ repoRoot }).version !== baseVersion) throw new Error('Unprepared hotfix version must match main.');
		return { state: 'pending', version: expectedVersion };
	}
	if (readPackageJson({ repoRoot }).version !== expectedVersion) throw new Error('Prepared hotfix must increment main by exactly one patch.');
	const output = path.join(repoRoot, '.release-output');
	const notes = path.join(output, `release-notes-v${expectedVersion}.md`);
	const provenance = path.join(output, `release-provenance-v${expectedVersion}.json`);
	if (!existsSync(notes) || !readFileSync(notes, 'utf8').trim() || !existsSync(provenance))
		throw new Error('Prepared hotfix notes and provenance are required.');
	const manifest = JSON.parse(readFileSync(provenance, 'utf8'));
	if (
		manifest.releaseVersion !== expectedVersion ||
		manifest.plans?.length !== 1 ||
		manifest.plans[0].branch !== branch ||
		manifest.plans[0].bump !== 'patch'
	)
		throw new Error('Prepared provenance must describe only this hotfix.');
	const record = manifest.plans[0];
	if (manifest.schemaVersion !== 1 || !record.sourcePlan || !Array.isArray(record.commits))
		throw new Error('Prepared provenance requires the complete source plan and commit metadata.');
	const entry = { fileName: record.fileName, plan: record.sourcePlan };
	const issues = collectReleasePlanIssues({
		entry,
		branch,
		baseRef: 'origin/main',
		headRef,
		packageVersion: baseVersion,
		currentMergeBase: baseSha,
		repoRoot
	});
	if (issues.length) throw new Error(`Invalid prepared source plan: ${issues.join('; ')}`);
	const notesText = readFileSync(notes, 'utf8');
	const date = /^## v[0-9.]+ - (\d{4}-\d{2}-\d{2})\n/.exec(notesText)?.[1];
	if (!date || !Number.isFinite(Date.parse(date))) throw new Error('Prepared notes require a valid release date.');
	const attributions = new Map(
		record.commits.map((commit) => [
			commit.sha,
			{
				authorLogin: commit.contributor,
				pullRequestNumber: commit.pullRequest?.number,
				pullRequestUrl: commit.pullRequest?.url
			}
		])
	);
	const expected = prepareReleasePreview({ plans: [entry], packageVersion: baseVersion, releaseDate: new Date(date), attributions });
	if (!isDeepStrictEqual(manifest, JSON.parse(JSON.stringify(expected.provenance))) || notesText !== expected.notes)
		throw new Error('Prepared notes or provenance differ from the validated source plan.');
	const changelog = path.join(repoRoot, 'CHANGELOG.md');
	if (!existsSync(changelog) || !readFileSync(changelog, 'utf8').startsWith(`# Changelog\n\n${expected.notes.trim()}\n\n`))
		throw new Error('Changelog must start with the exact prepared hotfix release notes.');
	return { state: 'prepared', version: expectedVersion };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const result = checkHotfix({
			branch: process.env.RELEASE_PLAN_BRANCH || git(['branch', '--show-current']),
			base: process.env.HOTFIX_BASE || 'origin/main',
			headRef: process.env.HOTFIX_HEAD_REF || 'HEAD',
			preparedOnly: process.argv.includes('--prepared')
		});
		console.log(`Valid ${result.state} hotfix v${result.version}. Review the diff for unrelated cherry-picked or copied changes separately.`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
