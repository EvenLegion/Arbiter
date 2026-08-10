import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReleasePlanMigration } from './plan-migration.mjs';

export function parseMigrationArguments(args) {
	const options = {
		fileName: null,
		mode: null,
		group: null,
		description: null,
		section: null,
		contributionSummary: null
	};
	const optionNames = new Map([
		['--file', 'fileName'],
		['--mode', 'mode'],
		['--group', 'group'],
		['--description', 'description'],
		['--section', 'section'],
		['--summary', 'contributionSummary']
	]);

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--' && index === 0) {
			continue;
		}

		const key = optionNames.get(argument);
		if (!key) {
			throw new Error(`Unknown release-plan migration argument: ${argument}`);
		}
		const value = args[index + 1];
		if (!value || value.startsWith('--')) {
			throw new Error(`${argument} requires a value.`);
		}
		if (options[key] !== null) {
			throw new Error(`${argument} may only be provided once.`);
		}
		options[key] = value;
		index += 1;
	}

	return options;
}

function main() {
	const options = parseMigrationArguments(process.argv.slice(2));
	const plan = runReleasePlanMigration(options);
	console.log(`Migrated .release-plans/${options.fileName} to schemaVersion ${plan.schemaVersion}.`);
	console.log(`Public note mode: ${plan.publicNote.mode}`);
	console.log('Review, stage, and commit the migrated plan explicitly.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
