import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	REPO_ROOT,
	readPackageJson,
	readReleasePlans,
	removeReleasePlanFiles,
	resolveReleaseCommitAttributions,
	updateChangelog,
	writeGithubOutput,
	writePackageJson,
	writeReleaseNotesOutput,
	writeReleaseProvenanceOutput
} from './lib.mjs';
import { assertValidReleaseAggregation, prepareReleasePreview } from './release-aggregation.mjs';

export async function runReleasePreview({
	repoRoot = REPO_ROOT,
	releaseDate = new Date(),
	attributions = null,
	requireCompleteAttribution = false
} = {}) {
	const plans = readReleasePlans({ repoRoot });
	if (plans.length === 0) {
		return { status: 'empty', plans: [] };
	}

	assertValidReleaseAggregation(plans);
	const resolvedAttributions =
		attributions ?? (await resolveReleaseCommitAttributions(plans, { repoRoot, strictAttribution: requireCompleteAttribution }));
	const packageJson = readPackageJson({ repoRoot });
	return {
		status: 'ready',
		plans,
		...prepareReleasePreview({
			plans,
			packageVersion: packageJson.version,
			releaseDate,
			attributions: resolvedAttributions
		})
	};
}

export async function runReleasePublish({ repoRoot = REPO_ROOT, releaseDate = new Date(), attributions = null, log = console.log } = {}) {
	const preview = await runReleasePreview({ repoRoot, releaseDate, attributions, requireCompleteAttribution: true });
	if (preview.status === 'empty') {
		log('No release plans found. Skipping release.');
		writeGithubOutput('release_created', 'false');
		return preview;
	}

	const releaseNotesPath = path.join(repoRoot, '.release-output', `release-notes-v${preview.version}.md`);
	const provenancePath = path.join(repoRoot, '.release-output', `release-provenance-v${preview.version}.json`);
	const snapshot = captureFiles([
		path.join(repoRoot, 'package.json'),
		path.join(repoRoot, 'CHANGELOG.md'),
		releaseNotesPath,
		provenancePath,
		path.join(repoRoot, '.release-plans', '.gitkeep'),
		...preview.plans.map(({ filePath }) => filePath)
	]);

	try {
		const packageJson = readPackageJson({ repoRoot });
		packageJson.version = preview.version;
		writePackageJson(packageJson, { repoRoot });
		updateChangelog({ version: preview.version, notes: preview.notes, repoRoot });
		writeReleaseNotesOutput({ version: preview.version, notes: preview.notes, repoRoot });
		writeReleaseProvenanceOutput({ version: preview.version, provenance: preview.provenance, repoRoot });
		removeReleasePlanFiles(preview.plans, { repoRoot });
		writeGithubOutput('release_created', 'true');
		writeGithubOutput('release_version', preview.version);
		writeGithubOutput('release_tag', `v${preview.version}`);
		writeGithubOutput('release_notes_path', path.relative(repoRoot, releaseNotesPath));
		writeGithubOutput('release_provenance_path', path.relative(repoRoot, provenancePath));
	} catch (error) {
		restoreFiles(snapshot);
		throw error;
	}

	log(`Prepared release v${preview.version}`);
	log(`Consumed ${preview.plans.length} release plan(s).`);
	log(`Public notes: ${preview.entries.length}.`);
	log(`Release notes: ${path.relative(process.cwd(), releaseNotesPath)}`);
	log(`Provenance manifest: ${path.relative(process.cwd(), provenancePath)}`);

	return {
		...preview,
		status: 'published',
		releaseNotesPath,
		provenancePath
	};
}

function captureFiles(filePaths) {
	return new Map(
		filePaths.map((filePath) => [
			filePath,
			{
				existed: existsSync(filePath),
				content: existsSync(filePath) ? readFileSync(filePath) : null
			}
		])
	);
}

function restoreFiles(snapshot) {
	for (const [filePath, previous] of snapshot) {
		if (!previous.existed) {
			rmSync(filePath, { force: true });
			continue;
		}
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, previous.content);
	}
}
