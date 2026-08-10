import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	BUMP_ORDER,
	REPO_ROOT,
	buildPlanCommits,
	bumpVersion,
	getBranchCommits,
	git,
	gitRefExists,
	readPackageJson,
	sanitizeBranchName,
	writeReleasePlanFile
} from './lib.mjs';
import {
	RELEASE_PLAN_BASE_REF,
	RELEASE_PLAN_SCHEMA_VERSION,
	ReleasePlanContractError,
	buildPublicNote,
	collectReleasePlanIssues,
	formatInvalidPlanMessage,
	getReleasePlansDirectory,
	inspectBranchReleasePlan
} from './plan-contract.mjs';

const RELEASE_PLAN_COMMIT_PREFIX = 'Release plan';

export async function runReleasePlan({
	repoRoot = REPO_ROOT,
	bump = null,
	mode = null,
	group = null,
	description = null,
	section = null,
	contributionSummary = null,
	regenerate = false,
	reason = null,
	promptForBump = null,
	log = console.log
} = {}) {
	const currentBranch = git(['branch', '--show-current'], { repoRoot });
	if (!currentBranch) {
		throw new Error('Unable to resolve current branch name. Check out a working branch before planning a release.');
	}

	if (currentBranch === 'main' || currentBranch === 'dev') {
		throw new Error('Run release planning from your working branch, not from main or dev.');
	}

	if (!gitRefExists(RELEASE_PLAN_BASE_REF, { repoRoot })) {
		throw new Error(`Unable to resolve ${RELEASE_PLAN_BASE_REF}. Fetch origin/dev before planning a release.`);
	}

	const inspection = inspectBranchReleasePlan({
		branch: currentBranch,
		baseRef: RELEASE_PLAN_BASE_REF,
		repoRoot
	});

	if (inspection.status === 'valid' && !regenerate) {
		if (bump && bump !== inspection.entry.plan.bump) {
			throw new Error(
				`The valid existing plan uses a ${inspection.entry.plan.bump} bump, not ${bump}. ` +
					'Use explicit regeneration with a reason if the intended release impact changed.'
			);
		}

		assertClassificationMatchesExistingPlan({
			plan: inspection.entry.plan,
			mode,
			group,
			description,
			section,
			contributionSummary
		});

		log(`Reusing valid release plan .release-plans/${inspection.entry.fileName} for ${currentBranch}.`);
		log('No files were written, staged, or committed.');
		return {
			status: 'reused',
			fileName: inspection.entry.fileName,
			plan: inspection.entry.plan
		};
	}

	if (inspection.status === 'invalid' && !regenerate) {
		throw new ReleasePlanContractError(
			formatInvalidPlanMessage({ branch: currentBranch, entry: inspection.entry, issues: inspection.issues }),
			'INVALID_BRANCH_PLAN'
		);
	}

	if (inspection.status === 'missing' && inspection.wrongBranchEntry) {
		throw new ReleasePlanContractError(
			`Cannot create the plan for ${currentBranch}: expected filename ${inspection.expectedFileName} already records branch ${String(
				inspection.wrongBranchEntry.plan?.branch
			)}. Rename or repair that plan explicitly before continuing.`,
			'WRONG_BRANCH_OWNERSHIP'
		);
	}

	if (regenerate) {
		if (inspection.status === 'missing') {
			throw new Error('Cannot regenerate because no parsed release plan owns this branch. Create one without --regenerate.');
		}

		if (!reason?.trim()) {
			throw new Error('Explicit regeneration requires --reason with a concise explanation of why the existing plan is being replaced.');
		}
	}

	let selectedBump = bump;
	if (!selectedBump && typeof promptForBump === 'function') {
		selectedBump = await promptForBump(readPackageJson({ repoRoot }).version);
	}

	if (!selectedBump) {
		throw new Error(`Noninteractive release-plan creation requires --bump with one of: ${BUMP_ORDER.join(', ')}.`);
	}

	if (!BUMP_ORDER.includes(selectedBump)) {
		throw new Error(`Unsupported bump type: ${String(selectedBump)}. Expected one of: ${BUMP_ORDER.join(', ')}`);
	}

	if (typeof contributionSummary !== 'string' || !contributionSummary.trim()) {
		throw new Error('Release-plan creation requires --summary with a concise implementation and provenance summary.');
	}

	const publicNote = buildPublicNote({
		mode,
		group,
		description,
		section
	});

	ensureCleanWorktree(repoRoot);

	const { mergeBase, commits } = getBranchCommits({
		baseRef: RELEASE_PLAN_BASE_REF,
		repoRoot
	});
	const planCommits = buildPlanCommits(commits);
	if (planCommits.length === 0) {
		const commitPreview = commits.map((commit) => `- ${commit.subject}`).join('\n') || '(no commits found)';
		throw new Error(`No Conventional Commit messages were found between ${mergeBase} and HEAD.\nChecked commits:\n${commitPreview}`);
	}

	const packageJson = readPackageJson({ repoRoot });
	const planHeadRef = git(['rev-parse', 'HEAD'], { repoRoot });
	const fileName =
		inspection.status === 'invalid' || inspection.status === 'valid' ? inspection.entry.fileName : `${sanitizeBranchName(currentBranch)}.json`;
	const plan = {
		schemaVersion: RELEASE_PLAN_SCHEMA_VERSION,
		branch: currentBranch,
		baseRef: RELEASE_PLAN_BASE_REF,
		mergeBase,
		headRef: planHeadRef,
		generatedAt: new Date().toISOString(),
		bump: selectedBump,
		targetVersion: bumpVersion(packageJson.version, selectedBump),
		contributionSummary: contributionSummary.trim(),
		publicNote,
		commits: planCommits
	};
	const candidateIssues = collectReleasePlanIssues({
		entry: { fileName, plan },
		branch: currentBranch,
		baseRef: RELEASE_PLAN_BASE_REF,
		headRef: 'HEAD',
		packageVersion: packageJson.version,
		currentMergeBase: mergeBase,
		repoRoot
	});
	if (candidateIssues.length > 0) {
		throw new Error(`Refusing to write an invalid release plan:\n${candidateIssues.map((issue) => `- ${issue}`).join('\n')}`);
	}

	const releasePlansDir = getReleasePlansDirectory(repoRoot);
	const filePath = path.join(releasePlansDir, fileName);
	const relativePath = path.posix.join('.release-plans', fileName);
	const previousContent = existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;

	if (regenerate) {
		log(`Regenerating .release-plans/${fileName}.`);
		log(`Reason: ${reason.trim()}`);
	}

	try {
		writeReleasePlanFile({ fileName, plan, releasePlansDir });
		git(['add', '--', relativePath], { repoRoot });
		const commitArgs = ['commit', '--only', '-m', buildReleasePlanCommitMessage(currentBranch)];
		if (regenerate) {
			commitArgs.push('-m', `Regenerated because: ${reason.trim()}`);
		}
		commitArgs.push('--', relativePath);
		git(commitArgs, { repoRoot });
	} catch (error) {
		rollbackPlanMutation({ filePath, previousContent, relativePath, repoRoot });
		throw error;
	}

	log(`Base ref: ${RELEASE_PLAN_BASE_REF}`);
	log(`Current version: v${packageJson.version}`);
	log(`Selected bump: ${selectedBump}`);
	log(`Planned version: v${plan.targetVersion}`);
	log(`Public note mode: ${plan.publicNote.mode}`);
	if (plan.publicNote.group) {
		log(`Capability group: ${plan.publicNote.group}`);
	}
	log(`Release plan written: .release-plans/${fileName}`);
	log(`Release plan committed: ${buildReleasePlanCommitMessage(currentBranch)}`);
	log('');
	log('Matched commits:');
	for (const commit of planCommits) {
		log(`- ${commit.subject}`);
	}

	return {
		status: regenerate ? 'regenerated' : 'created',
		fileName,
		plan
	};
}

function assertClassificationMatchesExistingPlan({ plan, mode, group, description, section, contributionSummary }) {
	const expected = {
		mode,
		group,
		description,
		section,
		contributionSummary
	};
	const supplied = Object.values(expected).some((value) => value !== null && value !== undefined);
	if (!supplied) {
		return;
	}

	const actual = {
		mode: plan.publicNote?.mode ?? null,
		group: plan.publicNote?.group ?? null,
		description: plan.publicNote?.description ?? null,
		section: plan.publicNote?.section ?? null,
		contributionSummary: plan.contributionSummary ?? null
	};
	for (const [field, expectedValue] of Object.entries(expected)) {
		if (expectedValue !== null && expectedValue !== undefined && actual[field] !== expectedValue) {
			throw new Error(
				`The valid existing plan records ${field}=${String(actual[field])}, not ${String(expectedValue)}. ` +
					'Use explicit regeneration with a reason if its classification or contribution summary must change.'
			);
		}
	}
}

function ensureCleanWorktree(repoRoot) {
	const status = git(['status', '--porcelain', '--untracked-files=all'], { repoRoot });
	if (status) {
		throw new Error(
			'Release-plan creation requires a clean worktree after the scoped Conventional Commits are created. Commit or reconcile these changes first:\n' +
				status
		);
	}
}

function rollbackPlanMutation({ filePath, previousContent, relativePath, repoRoot }) {
	try {
		git(['reset', '--quiet', 'HEAD', '--', relativePath], { repoRoot });
	} catch {
		// The target may not have reached the index.
	}

	if (previousContent === null) {
		rmSync(filePath, { force: true });
		return;
	}

	writeFileSync(filePath, previousContent);
}

function buildReleasePlanCommitMessage(currentBranch) {
	return `${RELEASE_PLAN_COMMIT_PREFIX} for ${currentBranch}`;
}
