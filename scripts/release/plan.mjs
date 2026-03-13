import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
	buildPlanCommits,
	bumpVersion,
	getBranchCommits,
	git,
	readPackageJson,
	resolveBaseRef,
	sanitizeBranchName,
	writeReleasePlanFile
} from './lib.mjs';

const RELEASE_BUMP_OPTIONS = ['patch', 'minor', 'major'];

async function main() {
	const currentBranch = git(['branch', '--show-current']);
	if (!currentBranch) {
		throw new Error('Unable to resolve current branch name.');
	}

	if (currentBranch === 'main' || currentBranch === 'dev') {
		throw new Error('Run release planning from your working branch, not from main or dev.');
	}

	const baseRef = resolveBaseRef();
	const { mergeBase, commits } = getBranchCommits({ baseRef });
	const planCommits = buildPlanCommits(commits);

	if (planCommits.length === 0) {
		const commitPreview = commits.map((commit) => `- ${commit.subject}`).join('\n') || '(no commits found)';
		throw new Error(
			`No Conventional Commit messages were found between ${mergeBase} and HEAD.\nChecked commits:\n${commitPreview}`
		);
	}

	const packageJson = readPackageJson();
	const bump = await promptForReleaseBump(packageJson.version);
	const nextVersion = bumpVersion(packageJson.version, bump);
	const fileName = `${sanitizeBranchName(currentBranch)}.json`;

	const plan = {
		schemaVersion: 1,
		branch: currentBranch,
		baseRef,
		mergeBase,
		headRef: git(['rev-parse', 'HEAD']),
		generatedAt: new Date().toISOString(),
		bump,
		targetVersion: nextVersion,
		commits: planCommits
	};

	writeReleasePlanFile({ fileName, plan });

	console.log(`Base ref: ${baseRef}`);
	console.log(`Current version: v${packageJson.version}`);
	console.log(`Selected bump: ${bump}`);
	console.log(`Planned version: v${nextVersion}`);
	console.log(`Release plan written: .release-plans/${fileName}`);
	console.log('');
	console.log('Matched commits:');
	for (const commit of planCommits) {
		console.log(`- ${commit.subject}`);
	}
}

async function promptForReleaseBump(currentVersion) {
	const rl = createInterface({ input, output });

	try {
		console.log(`Current app version: v${currentVersion}`);
		console.log('Select the release bump for this branch:');
		for (const [index, bump] of RELEASE_BUMP_OPTIONS.entries()) {
			console.log(`${index + 1}. ${bump} -> v${bumpVersion(currentVersion, bump)}`);
		}

		const answer = await rl.question('Enter choice (1-3): ');
		const selectedIndex = Number.parseInt(answer.trim(), 10) - 1;
		const selected = RELEASE_BUMP_OPTIONS[selectedIndex];
		if (!selected) {
			throw new Error('Invalid release bump selection.');
		}

		return selected;
	} finally {
		rl.close();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
