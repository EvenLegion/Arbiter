import { describe, expect, it } from 'vitest';

import { parseApiConfig } from '../src/config';

const authEnv = {
	API_DISCORD_CLIENT_ID: '100000000000000001',
	API_DISCORD_CLIENT_SECRET: 'test-discord-client-secret',
	API_DISCORD_CALLBACK_URL: 'http://127.0.0.1:3000/api/v1/auth/discord/callback',
	API_ALLOWED_ORIGINS: 'http://127.0.0.1:4173,http://localhost:4173',
	API_AUTH_REDIRECT_URLS: 'http://127.0.0.1:4173/auth/callback,http://localhost:4173/auth/callback'
};

describe('parseApiConfig', () => {
	it('builds bounded API, database, and Redis configuration', () => {
		const config = parseApiConfig({
			...authEnv,
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
		expect(config.directoryRateLimit).toEqual({ requests: 60, windowSeconds: 60 });
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
				...authEnv,
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
			...authEnv,
			DATABASE_URL: 'postgresql://arbiter@localhost/arbiter',
			API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters',
			REDIS_PASSWORD: ''
		});
		expect(config.redis.password).toBeUndefined();
	});

	it('requires a non-trivial API-only credential pepper', () => {
		expect(() =>
			parseApiConfig({ ...authEnv, DATABASE_URL: 'postgresql://arbiter@localhost/arbiter', API_CREDENTIAL_PEPPER: 'too-short' })
		).toThrowError(/API_CREDENTIAL_PEPPER/);
	});

	it('keeps the directory rate window within the API Redis TTL boundary', () => {
		expect(() =>
			parseApiConfig({
				...authEnv,
				DATABASE_URL: 'postgresql://arbiter@localhost/arbiter',
				API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters',
				API_REDIS_MAX_TTL_SECONDS: '300',
				API_AUTH_STATE_TTL_SECONDS: '300',
				API_SESSION_IDLE_TTL_SECONDS: '300',
				API_DIRECTORY_RATE_LIMIT_WINDOW_SECONDS: '600'
			})
		).toThrowError(/API_DIRECTORY_RATE_LIMIT_WINDOW_SECONDS/);
	});

	it('requires exact credentialed origins and redirect allowlisting', () => {
		expect(() =>
			parseApiConfig({
				...authEnv,
				DATABASE_URL: 'postgresql://arbiter@localhost/arbiter',
				API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters',
				API_ALLOWED_ORIGINS: '*'
			})
		).toThrowError(/API_ALLOWED_ORIGINS/);

		expect(() =>
			parseApiConfig({
				...authEnv,
				DATABASE_URL: 'postgresql://arbiter@localhost/arbiter',
				API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters',
				API_ALLOWED_ORIGINS: 'https://*.example.com'
			})
		).toThrowError(/wildcard hosts/);

		expect(() =>
			parseApiConfig({
				...authEnv,
				DATABASE_URL: 'postgresql://arbiter@localhost/arbiter',
				API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters',
				API_AUTH_REDIRECT_URLS: 'http://localhost:9999/auth/callback'
			})
		).toThrowError(/API_AUTH_REDIRECT_URLS/);
	});

	it('requires HTTPS auth URLs in production', () => {
		expect(() =>
			parseApiConfig({
				...authEnv,
				NODE_ENV: 'production',
				DATABASE_URL: 'postgresql://arbiter@localhost/arbiter',
				API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters'
			})
		).toThrowError(/HTTPS/);
	});

	it('requires an exact public HTTPS origin and explicit proxy trust in production', () => {
		const productionEnv = {
			...authEnv,
			NODE_ENV: 'production',
			API_DISCORD_CALLBACK_URL: 'https://api.arbiter.example/api/v1/auth/discord/callback',
			API_ALLOWED_ORIGINS: 'https://portal.arbiter.example',
			API_AUTH_REDIRECT_URLS: 'https://portal.arbiter.example/auth/callback',
			DATABASE_URL: 'postgresql://arbiter@database.example/arbiter',
			API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters'
		};
		expect(() => parseApiConfig(productionEnv)).toThrowError(/API_PUBLIC_URL/);
		expect(() => parseApiConfig({ ...productionEnv, API_PUBLIC_URL: 'https://api.arbiter.example' })).toThrowError(/API_TRUST_PROXY/);
		expect(parseApiConfig({ ...productionEnv, API_PUBLIC_URL: 'https://api.arbiter.example', API_TRUST_PROXY: 'true' })).toMatchObject({
			publicUrl: 'https://api.arbiter.example',
			trustProxy: true
		});
		expect(() => parseApiConfig({ ...productionEnv, API_PUBLIC_URL: 'https://other.arbiter.example', API_TRUST_PROXY: 'true' })).toThrowError(
			/API_DISCORD_CALLBACK_URL/
		);
	});
});
