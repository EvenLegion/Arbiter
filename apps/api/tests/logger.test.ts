import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createApiLogger } from '../src/logger';

describe('API logger', () => {
	it('redacts sensitive values from structured logs', () => {
		let output = '';
		const destination = new Writable({
			write(chunk, _encoding, callback) {
				output += chunk.toString();
				callback();
			}
		});
		const logger = createApiLogger({ logLevel: 'info', nodeEnv: 'test' }, destination);
		logger.info({ authorization: 'Bearer secret-token', config: { databaseUrl: 'postgresql://secret' } }, 'redaction test');

		expect(output).toContain('[REDACTED]');
		expect(output).not.toContain('secret-token');
		expect(output).not.toContain('postgresql://secret');
	});
});
