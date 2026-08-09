import { resolve } from 'node:path';
import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createApiLogger, resolveApiLogFilePath } from '../src/logger';

describe('API logger', () => {
	it('redacts sensitive values from structured logs', () => {
		let output = '';
		const destination = new Writable({
			write(chunk, _encoding, callback) {
				output += chunk.toString();
				callback();
			}
		});
		const logger = createApiLogger({ logLevel: 'info', logFilePath: 'unused.log', consoleLogLevel: 'silent', nodeEnv: 'test' }, destination);
		logger.info(
			{
				authorization: 'Bearer secret-token',
				config: { databaseUrl: 'postgresql://secret', credentialPepper: 'pepper-secret' },
				verifier: 'stored-digest-secret',
				credential: { verifier: 'nested-verifier-secret', secret: 'one-time-secret' }
			},
			'redaction test'
		);

		expect(output).toContain('"app":"arbiter"');
		expect(output).toContain('"service":"arbiter-api"');
		expect(output).toContain('[REDACTED]');
		expect(output).not.toContain('secret-token');
		expect(output).not.toContain('postgresql://secret');
		expect(output).not.toContain('pepper-secret');
		expect(output).not.toContain('stored-digest-secret');
		expect(output).not.toContain('nested-verifier-secret');
		expect(output).not.toContain('one-time-secret');
	});

	it('anchors relative file destinations at the repository root for Alloy', () => {
		expect(resolveApiLogFilePath('logs/api.log')).toBe(resolve(__dirname, '../../../logs/api.log'));
		expect(resolveApiLogFilePath('/var/log/arbiter/api.log')).toBe('/var/log/arbiter/api.log');
	});
});
