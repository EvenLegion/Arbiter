import path from 'node:path';
import {
	REPO_ROOT,
	aggregateReleaseEntries,
	bumpVersion,
	buildReleaseNotes,
	readPackageJson,
	readReleasePlans,
	removeReleasePlanFiles,
	resolveHighestBump,
	updateChangelog,
	writeGithubOutput,
	writePackageJson,
	writeReleaseNotesOutput
} from './lib.mjs';

async function main() {
	const plans = readReleasePlans();
	if (plans.length === 0) {
		console.log('No release plans found. Skipping release.');
		writeGithubOutput('release_created', 'false');
		return;
	}

	const packageJson = readPackageJson();
	const highestBump = resolveHighestBump(plans);
	const nextVersion = bumpVersion(packageJson.version, highestBump);
	const releaseEntries = await aggregateReleaseEntries(plans);
	const releaseNotes = buildReleaseNotes({
		version: nextVersion,
		entries: releaseEntries
	});
	const releaseNotesPath = writeReleaseNotesOutput({
		version: nextVersion,
		notes: releaseNotes
	});

	packageJson.version = nextVersion;
	writePackageJson(packageJson);
	updateChangelog({
		version: nextVersion,
		notes: releaseNotes
	});
	removeReleasePlanFiles(plans);

	console.log(`Prepared release v${nextVersion}`);
	console.log(`Consumed ${plans.length} release plan(s).`);
	console.log(`Release notes: ${path.relative(process.cwd(), releaseNotesPath)}`);

	writeGithubOutput('release_created', 'true');
	writeGithubOutput('release_version', nextVersion);
	writeGithubOutput('release_tag', `v${nextVersion}`);
	writeGithubOutput('release_notes_path', path.relative(REPO_ROOT, releaseNotesPath));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
