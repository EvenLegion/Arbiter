import 'dotenv/config';

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function formatTimestamp(date) {
	const parts = {
		year: String(date.getFullYear()),
		month: String(date.getMonth() + 1).padStart(2, '0'),
		day: String(date.getDate()).padStart(2, '0'),
		hour: String(date.getHours()).padStart(2, '0'),
		minute: String(date.getMinutes()).padStart(2, '0'),
		second: String(date.getSeconds()).padStart(2, '0')
	};

	return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`;
}

function resolveDatabaseConfig(databaseUrl) {
	let parsed;
	try {
		parsed = new URL(databaseUrl);
	} catch (error) {
		throw new Error(`DATABASE_URL is not a valid URL: ${error instanceof Error ? error.message : String(error)}`);
	}

	if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
		throw new Error(`Unsupported DATABASE_URL protocol: ${parsed.protocol}`);
	}

	const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
	if (!databaseName) {
		throw new Error('DATABASE_URL is missing a database name.');
	}

	return {
		databaseName,
		host: parsed.hostname,
		port: parsed.port || '5432',
		username: decodeURIComponent(parsed.username),
		password: decodeURIComponent(parsed.password)
	};
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL is required.');
	process.exit(1);
}

const { databaseName, host, port, username, password } = resolveDatabaseConfig(databaseUrl);
const outputPath =
	process.argv[2] !== undefined
		? resolve(process.cwd(), process.argv[2])
		: resolve(process.cwd(), 'data', 'db-backups', `${formatTimestamp(new Date())}.dump`);

mkdirSync(dirname(outputPath), { recursive: true });

const env = {
	...process.env,
	PGHOST: host,
	PGPORT: port,
	PGUSER: username,
	PGPASSWORD: password,
	PGDATABASE: databaseName
};

const sslmode = new URL(databaseUrl).searchParams.get('sslmode');
if (sslmode) {
	env.PGSSLMODE = sslmode;
}

const result = spawnSync('pg_dump', ['--format=custom', '--file', outputPath, '--verbose'], {
	stdio: 'inherit',
	env,
	shell: process.platform === 'win32'
});

if (result.error) {
	if ('code' in result.error && result.error.code === 'ENOENT') {
		console.error('pg_dump was not found on PATH. Install PostgreSQL client tools and try again.');
		process.exit(1);
	}

	console.error(result.error);
	process.exit(1);
}

if (typeof result.status === 'number' && result.status !== 0) {
	process.exit(result.status);
}

console.log(`Database backup written to ${outputPath}`);
