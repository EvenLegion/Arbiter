import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BUMP_ORDER, bumpVersion } from './lib.mjs';
import { runReleasePlan } from './plan-operation.mjs';

export function parsePlanArguments(args) {
	const options = {
		bump: null,
		mode: null,
		group: null,
		description: null,
		section: null,
		contributionSummary: null,
		regenerate: false,
		reason: null
	};
	const valueOptions = new Map([
		['--bump', 'bump'],
		['--mode', 'mode'],
		['--group', 'group'],
		['--description', 'description'],
		['--section', 'section'],
		['--summary', 'contributionSummary'],
		['--reason', 'reason']
	]);

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--' && index === 0) {
			continue;
		}

		if (argument === '--regenerate') {
			if (options.regenerate) {
				throw new Error('--regenerate may only be provided once.');
			}
			options.regenerate = true;
			continue;
		}

		const key = valueOptions.get(argument);
		if (key) {
			const value = args[index + 1];
			if (!value || value.startsWith('--')) {
				throw new Error(`${argument} requires a value.`);
			}

			if (options[key] !== null) {
				throw new Error(`${argument} may only be provided once.`);
			}
			options[key] = value;
			index += 1;
			continue;
		}

		throw new Error(`Unknown release-plan argument: ${argument}`);
	}

	if (options.reason && !options.regenerate) {
		throw new Error('--reason is only valid with --regenerate.');
	}

	return options;
}

async function promptForReleaseBump(currentVersion) {
	const rl = createInterface({ input, output });

	try {
		console.log(`Current app version: v${currentVersion}`);
		console.log('Select the release bump for this branch:');
		for (const [index, bump] of BUMP_ORDER.entries()) {
			console.log(`${index + 1}. ${bump} -> v${bumpVersion(currentVersion, bump)}`);
		}

		const answer = await rl.question('Enter choice (1-3): ');
		const selectedIndex = Number.parseInt(answer.trim(), 10) - 1;
		const selected = BUMP_ORDER[selectedIndex];
		if (!selected) {
			throw new Error('Invalid release bump selection.');
		}

		return selected;
	} finally {
		rl.close();
	}
}

async function main() {
	const options = parsePlanArguments(process.argv.slice(2));
	await runReleasePlan({
		...options,
		promptForBump: !options.bump && process.stdin.isTTY ? promptForReleaseBump : null
	});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});
}
