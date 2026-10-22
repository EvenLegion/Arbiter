import { DivisionKind } from '@prisma/client';
import Redis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { digestOpaqueToken } from '../../../apps/api/src/auth/crypto';
import { createPrismaAuthRepository } from '../../../apps/api/src/auth/prismaRepository';
import { createRedisAuthStore } from '../../../apps/api/src/auth/redisStore';
import { createAuthService } from '../../../apps/api/src/auth/service';
import type { AuthService } from '../../../apps/api/src/auth/types';
import { createDivision, createUser } from '../setup/fixtures';
import { createStandalonePrisma, deployPrismaMigrations, resetDatabase, type StandalonePrisma } from '../setup/database';
import { startIntegrationContainers, stopIntegrationContainers, type IntegrationContainers } from '../setup/testcontainers';

const CALLBACK_URL = 'http://127.0.0.1:3000/api/v1/auth/discord/callback';
const REDIRECT_URL = 'http://127.0.0.1:4173/auth/callback';
const DISCORD_USER_ID = '100000000000000001';

describe('API OAuth session and canonical staff authorization integration', () => {
	let containers: IntegrationContainers;
	let standalone: StandalonePrisma;
	let redis: Redis;
	let currentTimeMs: number;
	let oauthDiscordUserId: string;
	let service: AuthService;

	beforeAll(async () => {
		containers = await startIntegrationContainers();
		deployPrismaMigrations(containers.databaseUrl);
		standalone = createStandalonePrisma(containers.databaseUrl);
		redis = new Redis(containers.redisUrl, { keyPrefix: 'arbiter:api:v1:' });
	});

	beforeEach(async () => {
		await resetDatabase(standalone.prisma);
		await redis.flushdb();
		currentTimeMs = Date.parse('2026-08-09T18:00:00.000Z');
		oauthDiscordUserId = DISCORD_USER_ID;
		service = createAuthService({
			store: createRedisAuthStore(redis),
			repository: createPrismaAuthRepository(standalone.prisma),
			oauthClient: { resolveDiscordUserId: vi.fn().mockImplementation(async () => oauthDiscordUserId) },
			clientId: '100000000000000001',
			callbackUrl: CALLBACK_URL,
			allowedRedirectUrls: [REDIRECT_URL],
			stateTtlSeconds: 600,
			sessionIdleTtlSeconds: 300,
			sessionAbsoluteTtlSeconds: 900,
			now: () => currentTimeMs
		});
	});

	afterAll(async () => {
		await redis?.quit();
		await standalone?.close();
		await stopIntegrationContainers(containers);
	});

	it('makes state single-use, browser-bound, namespaced, and TTL-bounded', async () => {
		const started = await service.beginOAuth({ redirectUri: REDIRECT_URL });
		const state = new URL(started.authorizationUrl).searchParams.get('state')!;
		const stateKey = `auth:oauth-state:${digestOpaqueToken(state)}`;
		await expect(redis.ttl(stateKey)).resolves.toBeGreaterThan(0);
		await expect(redis.ttl(stateKey)).resolves.toBeLessThanOrEqual(600);
		const keys = await redis.keys('arbiter:api:v1:auth:*');
		expect(keys).toEqual([`arbiter:api:v1:${stateKey}`]);
		expect(keys[0]).not.toContain(state);

		await expect(service.completeOAuth({ code: 'code', state, bindingId: 'X'.repeat(43) })).rejects.toMatchObject({
			code: 'invalid_oauth_state'
		});
		await expect(service.completeOAuth({ code: 'code', state, bindingId: started.bindingId })).rejects.toMatchObject({
			code: 'invalid_oauth_state'
		});
	});

	it('authorizes STAFF and EXEC from current Postgres memberships on every request', async () => {
		const user = await createUser(standalone.prisma, { discordUserId: DISCORD_USER_ID });
		const [staff, exec] = await Promise.all([
			createDivision(standalone.prisma, { code: 'TECH-AUTH', name: 'Tech Auth', kind: DivisionKind.STAFF }),
			createDivision(standalone.prisma, { code: 'EXEC', name: 'Executive Auth', kind: DivisionKind.STAFF })
		]);
		await standalone.prisma.divisionMembership.create({ data: { userId: user.id, divisionId: staff.id } });

		const started = await service.beginOAuth({ redirectUri: REDIRECT_URL });
		const completed = await service.completeOAuth({
			code: 'code',
			state: new URL(started.authorizationUrl).searchParams.get('state')!,
			bindingId: started.bindingId
		});
		await expect(service.requireSession(completed.sessionId)).resolves.toMatchObject({ identity: { userId: user.id, role: 'STAFF' } });

		await standalone.prisma.divisionMembership.create({ data: { userId: user.id, divisionId: exec.id } });
		await expect(service.requireSession(completed.sessionId)).resolves.toMatchObject({ identity: { role: 'EXEC' } });

		await standalone.prisma.divisionMembership.deleteMany({ where: { userId: user.id } });
		await expect(service.requireSession(completed.sessionId)).rejects.toMatchObject({ code: 'forbidden' });
		await expect(service.requireSession(completed.sessionId)).rejects.toMatchObject({ code: 'unauthorized' });
	});

	it('uses the same denial for unknown and non-staff users', async () => {
		const user = await createUser(standalone.prisma, { discordUserId: DISCORD_USER_ID });
		const member = await createDivision(standalone.prisma, { code: 'NVY-AUTH', name: 'Navy Auth', kind: DivisionKind.NAVY });
		await standalone.prisma.divisionMembership.create({ data: { userId: user.id, divisionId: member.id } });

		for (const discordUserId of [DISCORD_USER_ID, '100000000000000099']) {
			oauthDiscordUserId = discordUserId;
			const started = await service.beginOAuth({ redirectUri: REDIRECT_URL });
			await expect(
				service.completeOAuth({
					code: 'code',
					state: new URL(started.authorizationUrl).searchParams.get('state')!,
					bindingId: started.bindingId
				})
			).rejects.toMatchObject({ code: 'forbidden' });
		}
	});

	it('enforces idle and absolute session expiry and keeps opaque IDs out of Redis keys', async () => {
		const user = await createUser(standalone.prisma, { discordUserId: DISCORD_USER_ID });
		const staff = await createDivision(standalone.prisma, { code: 'SEC-AUTH', name: 'Security Auth', kind: DivisionKind.STAFF });
		await standalone.prisma.divisionMembership.create({ data: { userId: user.id, divisionId: staff.id } });
		const started = await service.beginOAuth({ redirectUri: REDIRECT_URL });
		const completed = await service.completeOAuth({
			code: 'code',
			state: new URL(started.authorizationUrl).searchParams.get('state')!,
			bindingId: started.bindingId
		});
		const keys = await redis.keys('arbiter:api:v1:auth:session:*');
		expect(keys).toHaveLength(1);
		expect(keys[0]).not.toContain(completed.sessionId);

		currentTimeMs += 299_000;
		await expect(service.requireSession(completed.sessionId)).resolves.toMatchObject({ identity: { role: 'STAFF' } });
		currentTimeMs += 301_000;
		await expect(service.requireSession(completed.sessionId)).rejects.toMatchObject({ code: 'unauthorized' });

		const absoluteStart = await service.beginOAuth({ redirectUri: REDIRECT_URL });
		const absoluteSession = await service.completeOAuth({
			code: 'code',
			state: new URL(absoluteStart.authorizationUrl).searchParams.get('state')!,
			bindingId: absoluteStart.bindingId
		});
		for (let index = 0; index < 2; index += 1) {
			currentTimeMs += 299_000;
			await expect(service.requireSession(absoluteSession.sessionId)).resolves.toBeDefined();
		}
		currentTimeMs += 303_000;
		await expect(service.requireSession(absoluteSession.sessionId)).rejects.toMatchObject({ code: 'unauthorized' });
	});
});
