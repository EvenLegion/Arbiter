import path from 'node:path';
import { REPO_ROOT, writeReleasePlanFile } from './lib.mjs';
import { RELEASE_PLAN_SCHEMA_VERSION, buildPublicNote, collectReleasePlanStructureIssues, readReleasePlanCandidates } from './plan-contract.mjs';

export function runReleasePlanMigration({
	repoRoot = REPO_ROOT,
	fileName,
	mode,
	group = null,
	description = null,
	section = null,
	contributionSummary
} = {}) {
	if (typeof fileName !== 'string' || path.basename(fileName) !== fileName || !fileName.endsWith('.json')) {
		throw new Error('--file must name one JSON file directly under .release-plans.');
	}

	const entry = readReleasePlanCandidates({ repoRoot }).find((candidate) => candidate.fileName === fileName);
	if (!entry) {
		throw new Error(`Release plan .release-plans/${fileName} was not found.`);
	}
	if (entry.plan?.schemaVersion !== 1) {
		throw new Error(
			`Release plan ${fileName} uses schemaVersion ${String(entry.plan?.schemaVersion)}; only explicit schemaVersion 1 migrations are supported.`
		);
	}
	if (typeof contributionSummary !== 'string' || !contributionSummary.trim()) {
		throw new Error('Migration requires --summary with a concise implementation and provenance summary.');
	}

	const publicNote = buildPublicNote({ mode, group, description, section });
	const migratedPlan = {
		...entry.plan,
		schemaVersion: RELEASE_PLAN_SCHEMA_VERSION,
		contributionSummary: contributionSummary.trim(),
		publicNote,
		commits: (entry.plan.commits ?? []).map(({ releaseNoteLabel: _legacyPublicLabel, ...commit }) => commit)
	};
	const issues = collectReleasePlanStructureIssues({ plan: migratedPlan, fileName });
	if (issues.length > 0) {
		throw new Error(`Refusing to write an invalid migrated plan:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
	}

	writeReleasePlanFile({ fileName, plan: migratedPlan, releasePlansDir: path.join(repoRoot, '.release-plans') });
	return migratedPlan;
}
