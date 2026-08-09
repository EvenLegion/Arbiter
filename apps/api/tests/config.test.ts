import { describe, expect, it } from 'vitest';

import { parseApiConfig } from '../src/config';

describe('parseApiConfig', () => {
	it('builds bounded API, database, and Redis configuration', () => {
		const config = parseApiConfig({
			DATABASE_URL: 'postgresql://arbiter:secret@db.example/arbiter',
			API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters',
			REDIS_HOST: 'redis.example',
			REDIS_PASSWORD: 'redis-secret',
			API_REDIS_NAMESPACE: 'arbiter:api:v1'
		});

		expect(config.databasePoolMax).toBe(4);
		expect(config.credentialPepper).toBe('test-credential-pepper-at-least-32-characters');
		expect(config.bodyLimitBytes).toBe(65_536);
		expect(config.logFilePath).toBe('logs/api.log');
		expect(config.consoleLogLevel).toBe('info');
		expect(config.databaseConnectTimeoutMs).toBe(5_000);
		expect(config.redisConnectTimeoutMs).toBe(5_000);
		expect(config.redis).toMatchObject({
			host: 'redis.example',
			namespace: 'arbiter:api:v1',
			maxTtlSeconds: 3_600
		});
	});

	it('reports invalid field names without echoing secret values', () => {
		expect(() =>
			parseApiConfig({
				DATABASE_URL: 'postgresql://arbiter:super-secret@db.example/arbiter',
				API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters',
				REDIS_PASSWORD: 'another-secret',
				API_REDIS_NAMESPACE: 'INVALID NAMESPACE'
			})
		).toThrowError(/API_REDIS_NAMESPACE/);

		try {
			parseApiConfig({
				DATABASE_URL: 'postgresql://arbiter:super-secret@db.example/arbiter',
				API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters',
				API_REDIS_NAMESPACE: 'INVALID NAMESPACE'
			});
		} catch (error) {
			expect(String(error)).not.toContain('super-secret');
		}
	});

	it('treats an empty Redis password as no password for local Compose', () => {
		const config = parseApiConfig({
			DATABASE_URL: 'postgresql://arbiter@localhost/arbiter',
			API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters',
			REDIS_PASSWORD: ''
		});
		expect(config.redis.password).toBeUndefined();
	});

	it('requires a non-trivial API-only credential pepper', () => {
		expect(() => parseApiConfig({ DATABASE_URL: 'postgresql://arbiter@localhost/arbiter', API_CREDENTIAL_PEPPER: 'too-short' })).toThrowError(
			/API_CREDENTIAL_PEPPER/
		);
	});
});
