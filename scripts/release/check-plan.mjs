import { git } from './lib.mjs';
import { RELEASE_PLAN_BASE_REF, assertValidBranchReleasePlan } from './plan-contract.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function parseCheckArguments(args) {
	const options = {
		branch: process.env.RELEASE_PLAN_BRANCH || process.env.GITHUB_HEAD_REF || null,
		baseRef: RELEASE_PLAN_BASE_REF,
		headRef: 'HEAD'
	};

	const optionNames = new Map([
		['--branch', 'branch'],
		['--base', 'baseRef'],
		['--head', 'headRef']
	]);

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--' && index === 0) {
			continue;
		}

		const key = optionNames.get(argument);
		if (!key) {
			throw new Error(`Unknown release-plan check argument: ${argument}`);
		}

		const value = args[index + 1];
		if (!value || value.startsWith('--')) {
			throw new Error(`${argument} requires a value.`);
		}
		options[key] = value;
		index += 1;
	}

	return options;
}

function main() {
	const options = parseCheckArguments(process.argv.slice(2));
	const branch = options.branch || git(['branch', '--show-current']);
	if (!branch) {
		throw new Error('Unable to resolve the working branch. Pass --branch explicitly.');
	}

	const inspection = assertValidBranchReleasePlan({
		branch,
		baseRef: options.baseRef,
		headRef: options.headRef
	});

	console.log(`Valid release plan: .release-plans/${inspection.entry.fileName}`);
	console.log(`Branch: ${branch}`);
	console.log(`Base: ${options.baseRef} at ${inspection.currentMergeBase}`);
	console.log(`Recorded head: ${inspection.entry.plan.headRef}`);
	console.log('Later commits are allowed when the recorded head and plan commits remain in the current branch history.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
