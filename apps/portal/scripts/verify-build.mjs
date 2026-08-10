import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const buildDirectory = new URL('../dist/', import.meta.url);
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

async function listFiles(directoryUrl) {
	const paths = [];
	for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
		const path = join(directoryUrl.pathname, entry.name);
		if (entry.isDirectory()) paths.push(...(await listFiles(new URL(`${entry.name}/`, directoryUrl))));
		else paths.push(path);
	}
	return paths;
}
