import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReleasePublish } from './release-operation.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	runReleasePublish().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});
}
