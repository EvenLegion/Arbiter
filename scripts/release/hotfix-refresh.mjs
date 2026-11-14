import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHotfix } from './hotfix-check.mjs';
import { REPO_ROOT, git, readPackageJson, writePackageJson, writeReleasePlanFile } from './lib.mjs';

// Explicit local artifact reset, not release publication. Restore the consumed
// plan so the normal regeneration/preparation flow can revise public copy.
export function refreshHotfix({ repoRoot = REPO_ROOT, branch } = {}) {
	if (git(['status', '--porcelain'], { repoRoot })) throw new Error('Commit local work before refreshing prepared hotfix artifacts.');
	const packageJson = readPackageJson({ repoRoot });
	const version = packageJson.version;
	if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid prepared version.');
	const output = path.join(repoRoot, '.release-output');
	const provenancePath = path.join(output, `release-provenance-v${version}.json`);
	const record = JSON.parse(readFileSync(provenancePath, 'utf8')).plans[0];
	const base = record?.sourcePlan?.mergeBase;
	if (!/^[a-f0-9]{40}$/.test(base || '')) throw new Error('Prepared source base is missing.');
	checkHotfix({ repoRoot, branch, base, preparedOnly: true });
	if (!/^[a-zA-Z0-9._-]+\.json$/.test(record.fileName)) throw new Error('Invalid source plan filename.');
	packageJson.version = JSON.parse(git(['show', `${base}:package.json`], { repoRoot })).version;
	// All validation and reads happen before changing files.
	const hasChangelog = git(['ls-tree', '--name-only', base, '--', 'CHANGELOG.md'], { repoRoot });
	const changelog = hasChangelog ? git(['show', `${base}:CHANGELOG.md`], { repoRoot }) + '\n' : null;
	const planPath = path.join(repoRoot, '.release-plans', record.fileName);
	if (existsSync(planPath)) throw new Error('Refusing to overwrite a pending release plan.');
	writeReleasePlanFile({ fileName: record.fileName, plan: record.sourcePlan, releasePlansDir: path.dirname(planPath) });
	writePackageJson(packageJson, { repoRoot });
	if (changelog !== null) writeFileSync(path.join(repoRoot, 'CHANGELOG.md'), changelog);
	else rmSync(path.join(repoRoot, 'CHANGELOG.md'), { force: true });
	rmSync(provenancePath);
	rmSync(path.join(output, `release-notes-v${version}.md`));
	return { version };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const { version } = refreshHotfix({ branch: git(['branch', '--show-current']) });
		console.log(
			`Restored the pending plan for v${version}. Review and commit the artifact reset, then regenerate the plan with explicit classification and reason. No commit, push or release was performed.`
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
