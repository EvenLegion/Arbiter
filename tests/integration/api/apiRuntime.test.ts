import Redis from 'ioredis';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseApiConfig, type ApiConfig } from '../../../apps/api/src/config';
import { createApiRuntime, type ApiRuntime } from '../../../apps/api/src/http/server';
import { createApiDependencies, type ApiDependencies } from '../../../apps/api/src/runtime/dependencies';
import { createStandalonePrisma, type StandalonePrisma } from '../setup/database';
import { startIntegrationContainers, stopIntegrationContainers, type IntegrationContainers } from '../setup/testcontainers';

describe('standalone API dependency and lifecycle integration', () => {
	let containers: IntegrationContainers;
	let config: ApiConfig;
	let dependencies: ApiDependencies;
	let runtime: ApiRuntime;
	let botDatabaseClient: StandalonePrisma;
	let botRedisClient: Redis;

	beforeAll(async () => {
		containers = await startIntegrationContainers();
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
			API_LOG_LEVEL: 'silent'
		});
		botDatabaseClient = createStandalonePrisma(containers.databaseUrl);
		botRedisClient = new Redis(containers.redisUrl);
		dependencies = createApiDependencies(config, pino({ level: 'silent' }));
		runtime = createApiRuntime({ config, dependencies, logger: pino({ level: 'silent' }) });
	});

	afterAll(async () => {
		await runtime?.stop();
		await botRedisClient?.quit();
		await botDatabaseClient?.close();
		await stopIntegrationContainers(containers);
	});

	it('starts, becomes ready, and stops without controlling bot-owned connections', async () => {
		const address = await runtime.start();
		const readiness = await fetch(`http://127.0.0.1:${address.port}/api/v1/readiness`);
		expect(readiness.status).toBe(200);
		expect(await readiness.json()).toMatchObject({ data: { status: 'ready' } });

		await runtime.stop();

		await expect(botDatabaseClient.prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
		await expect(botRedisClient.ping()).resolves.toBe('PONG');
	});
});
