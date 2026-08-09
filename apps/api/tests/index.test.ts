import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadApiEnvironment } from '../src/index';

describe('API environment loading', () => {
	const marker = 'ARBITER_API_ENV_FILE_TEST';
	let directory: string | undefined;

	afterEach(() => {
		delete process.env[marker];
		if (directory) rmSync(directory, { recursive: true, force: true });
		directory = undefined;
	});

	it('loads the repository env file before configuration parsing', () => {
		directory = mkdtempSync(join(tmpdir(), 'arbiter-api-env-'));
		const envFile = join(directory, '.env');
		writeFileSync(envFile, `${marker}=loaded\n`, { encoding: 'utf8', mode: 0o600 });

		loadApiEnvironment(envFile);

		expect(process.env[marker]).toBe('loaded');
	});

	it('allows container environments without a repository env file', () => {
		expect(() => loadApiEnvironment('/definitely/missing/arbiter-api.env')).not.toThrow();
	});
});
