import Redis from 'ioredis';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseApiConfig, type ApiConfig } from '../../../apps/api/src/config';
import { createApiRuntime, type ApiRuntime } from '../../../apps/api/src/http/server';
import { createApiDependencies, type ApiDependencies } from '../../../apps/api/src/runtime/dependencies';
import { createStandalonePrisma, deployPrismaMigrations, type StandalonePrisma } from '../setup/database';
import { createUser } from '../setup/fixtures';
import { startIntegrationContainers, stopIntegrationContainers, type IntegrationContainers } from '../setup/testcontainers';

describe('standalone API dependency and lifecycle integration', () => {
	let containers: IntegrationContainers;
	let config: ApiConfig;
	let dependencies: ApiDependencies;
	let runtime: ApiRuntime;
	let baseUrl: string;
	let botDatabaseClient: StandalonePrisma;
	let botRedisClient: Redis;

	beforeAll(async () => {
		containers = await startIntegrationContainers();
		deployPrismaMigrations(containers.databaseUrl);
		const redisUrl = new URL(containers.redisUrl);
		config = parseApiConfig({
			NODE_ENV: 'test',
			DATABASE_URL: containers.databaseUrl,
			API_CREDENTIAL_PEPPER: 'test-credential-pepper-at-least-32-characters',
			API_DISCORD_CLIENT_ID: '100000000000000001',
			API_DISCORD_CLIENT_SECRET: 'test-discord-client-secret',
			API_DISCORD_CALLBACK_URL: 'http://127.0.0.1:3000/api/v1/auth/discord/callback',
			API_ALLOWED_ORIGINS: 'http://127.0.0.1:4173',
			API_AUTH_REDIRECT_URLS: 'http://127.0.0.1:4173/auth/callback',
			REDIS_HOST: redisUrl.hostname,
			REDIS_PORT: redisUrl.port,
			REDIS_PASSWORD: decodeURIComponent(redisUrl.password),
			REDIS_DB: '0',
			API_HOST: '127.0.0.1',
			API_PORT: '0',
			API_LOG_LEVEL: 'silent',
			API_DIRECTORY_RATE_LIMIT_REQUESTS: '3',
			API_DIRECTORY_RATE_LIMIT_WINDOW_SECONDS: '60'
		});
		botDatabaseClient = createStandalonePrisma(containers.databaseUrl);
		botRedisClient = new Redis(containers.redisUrl);
		dependencies = createApiDependencies(config, pino({ level: 'silent' }));
		runtime = createApiRuntime({ config, dependencies, logger: pino({ level: 'silent' }) });
		const address = await runtime.start();
		baseUrl = `http://127.0.0.1:${address.port}`;
	});

	afterAll(async () => {
		await runtime?.stop();
		await botRedisClient?.quit();
		await botDatabaseClient?.close();
		await stopIntegrationContainers(containers);
	});

	it('serves the first authenticated directory request without a readiness probe', async () => {
		const user = await createUser(botDatabaseClient.prisma, { discordUserId: '100000000000000010' });
		const integration = await dependencies.credentialService.createIntegration(
			{ userId: user.id, role: 'STAFF' },
			{ name: 'First request integration', purpose: 'Verify lazy rate-limit startup' }
		);
		if (!integration.ok) throw new Error(`Integration setup failed: ${integration.error.code}`);
		const minted = await dependencies.credentialService.mintCredential(
			{ userId: user.id, role: 'STAFF' },
			{ integrationId: integration.value.id, label: 'First request test', scopes: ['users:read'] }
		);
		if (!minted.ok) throw new Error(`Credential setup failed: ${minted.error.code}`);

		const response = await fetch(`${baseUrl}/api/v1/users/${user.discordUserId}`, {
			headers: { authorization: `Bearer ${minted.value.secret}` }
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ data: { discordUserId: user.discordUserId } });

		await botRedisClient.del(`arbiter:api:v1:rate:directory:${minted.value.credential.id}`);
	});

	it('starts and becomes ready with the API-owned dependency clients', async () => {
		const readiness = await fetch(`${baseUrl}/api/v1/readiness`);
		expect(readiness.status).toBe(200);
		expect(await readiness.json()).toMatchObject({ data: { status: 'ready' } });
	});

	it('serves credential-authenticated directory reads with canonical Postgres data and Redis rate limits', async () => {
		const user = await createUser(botDatabaseClient.prisma, { discordUserId: '100000000000000001' });
		const integration = await dependencies.credentialService.createIntegration(
			{ userId: user.id, role: 'STAFF' },
			{ name: 'Directory runtime integration', purpose: 'Exercise public user reads' }
		);
		if (!integration.ok) throw new Error(`Integration setup failed: ${integration.error.code}`);
		const minted = await dependencies.credentialService.mintCredential(
			{ userId: user.id, role: 'STAFF' },
			{ integrationId: integration.value.id, label: 'Runtime test', scopes: ['users:read'] }
		);
		if (!minted.ok) throw new Error(`Credential setup failed: ${minted.error.code}`);
		const headers = { authorization: `Bearer ${minted.value.secret}` };

		const direct = await fetch(`${baseUrl}/api/v1/users/${user.discordUserId}`, { headers });
		expect(direct.status).toBe(200);
		expect(await direct.json()).toMatchObject({
			data: {
				discordUserId: user.discordUserId,
				memberships: [],
				totalMerits: 0,
				rankLevel: null,
				rankSymbol: null
			}
		});

		const query = await fetch(`${baseUrl}/api/v1/users/query`, {
			method: 'POST',
			headers: { ...headers, 'content-type': 'application/json' },
			body: JSON.stringify({ discordUserIds: [user.discordUserId], limit: 1 })
		});
		expect(query.status).toBe(200);
		expect(await query.json()).toMatchObject({ data: { users: [{ discordUserId: user.discordUserId }], nextCursor: null } });

		const missing = await fetch(`${baseUrl}/api/v1/users/999999999999999999`, { headers });
		expect(missing.status).toBe(404);
		const limited = await fetch(`${baseUrl}/api/v1/users/${user.discordUserId}`, { headers });
		expect(limited.status).toBe(429);
		expect(limited.headers.get('retry-after')).not.toBeNull();

		const rateKeys = await botRedisClient.keys('arbiter:api:v1:rate:directory:*');
		expect(rateKeys).toHaveLength(1);
		await expect(botRedisClient.ttl(rateKeys[0] ?? '')).resolves.toBeGreaterThan(0);
		expect(await botDatabaseClient.prisma.apiCredential.findUniqueOrThrow({ where: { id: minted.value.credential.id } })).toMatchObject({
			lastUsedAt: expect.any(Date)
		});

		await dependencies.credentialService.revokeCredential({ userId: user.id, role: 'STAFF' }, minted.value.credential.id);
		const revoked = await fetch(`${baseUrl}/api/v1/users/${user.discordUserId}`, { headers });
		expect(revoked.status).toBe(401);

		await runtime.stop();
		await expect(botDatabaseClient.prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
		await expect(botRedisClient.ping()).resolves.toBe('PONG');
	});
});
