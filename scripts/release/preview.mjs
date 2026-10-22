import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReleasePreview } from './release-operation.mjs';

async function main() {
	const preview = await runReleasePreview();
	if (preview.status === 'empty') {
		console.log('No release plans found. Nothing to preview.');
		return;
	}

	console.log(preview.notes.trimEnd());
	console.log('');
	console.log('Provenance manifest preview:');
	console.log(JSON.stringify(preview.provenance, null, '\t'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});
}
