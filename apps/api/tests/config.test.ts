import { describe, expect, it } from 'vitest';

import { parseApiConfig } from '../src/config';

describe('parseApiConfig', () => {
	it('builds bounded API, database, and Redis configuration', () => {
		const config = parseApiConfig({
			DATABASE_URL: 'postgresql://arbiter:secret@db.example/arbiter',
			REDIS_HOST: 'redis.example',
			REDIS_PASSWORD: 'redis-secret',
			API_REDIS_NAMESPACE: 'arbiter:api:v1'
		});

		expect(config.databasePoolMax).toBe(4);
		expect(config.bodyLimitBytes).toBe(65_536);
		expect(config.logFilePath).toBe('logs/api.log');
		expect(config.consoleLogLevel).toBe('info');
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
				REDIS_PASSWORD: 'another-secret',
				API_REDIS_NAMESPACE: 'INVALID NAMESPACE'
			})
		).toThrowError(/API_REDIS_NAMESPACE/);

		try {
			parseApiConfig({ DATABASE_URL: 'postgresql://arbiter:super-secret@db.example/arbiter', API_REDIS_NAMESPACE: 'INVALID NAMESPACE' });
		} catch (error) {
			expect(String(error)).not.toContain('super-secret');
		}
	});

	it('treats an empty Redis password as no password for local Compose', () => {
		const config = parseApiConfig({ DATABASE_URL: 'postgresql://arbiter@localhost/arbiter', REDIS_PASSWORD: '' });
		expect(config.redis.password).toBeUndefined();
	});
});
