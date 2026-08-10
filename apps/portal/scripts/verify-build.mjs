import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
const forbidden = [
	'API_CREDENTIAL_PEPPER',
	'API_DISCORD_CLIENT_SECRET',
	'DATABASE_URL',
	'REDIS_PASSWORD',
	'@prisma/client',
	'ioredis',
	'postgresql://',
	'redis://'
];

for (const path of await listFiles(buildDirectory)) {
	if (extname(path) === '.map') throw new Error(`Portal build must not contain source maps: ${path}`);
	if (!['.html', '.js', '.css', '.json'].includes(extname(path))) continue;
	const contents = await readFile(path, 'utf8');
	for (const marker of forbidden) {
		if (contents.includes(marker)) throw new Error(`Portal build contains forbidden server-only marker ${marker} in ${path}`);
	}
}

process.stdout.write('Portal build contains no source maps or server-only configuration markers.\n');

async function listFiles(directory) {
	const paths = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) paths.push(...(await listFiles(path)));
		else paths.push(path);
	}
	return paths;
}
