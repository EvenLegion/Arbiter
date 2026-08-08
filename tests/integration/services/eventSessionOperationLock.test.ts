import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { flushRedisDatabase } from '../setup/redis';
import { applyRedisTestEnv, startRedisTestContainer, stopRedisTestContainer } from '../setup/testcontainers';

describe('event-session operation lock integration', () => {
	let redisUrl: string;
	let redisContainer: Awaited<ReturnType<typeof startRedisTestContainer>>['redis'];
	let acquireEventSessionOperationLock: typeof import('../../../src/integrations/redis/eventSessionOperationLock').acquireEventSessionOperationLock;
	let renewEventSessionOperationLock: typeof import('../../../src/integrations/redis/eventSessionOperationLock').renewEventSessionOperationLock;
	let releaseEventSessionOperationLock: typeof import('../../../src/integrations/redis/eventSessionOperationLock').releaseEventSessionOperationLock;
	let startEventSessionOperationLockLease: typeof import('../../../src/integrations/redis/eventSessionOperationLock').startEventSessionOperationLockLease;
	let closeRedisClient: typeof import('../../../src/integrations/redis/client').closeRedisClient;

	beforeAll(async () => {
		const started = await startRedisTestContainer();
		redisContainer = started.redis;
		redisUrl = started.redisUrl;
		applyRedisTestEnv(redisUrl);
		vi.resetModules();
		({ acquireEventSessionOperationLock, renewEventSessionOperationLock, releaseEventSessionOperationLock, startEventSessionOperationLockLease } =
			await import('../../../src/integrations/redis/eventSessionOperationLock'));
		({ closeRedisClient } = await import('../../../src/integrations/redis/client'));
	});

	beforeEach(async () => {
		await flushRedisDatabase(redisUrl);
	});

	afterAll(async () => {
		if (closeRedisClient) {
			await closeRedisClient();
		}
		if (redisContainer) {
			await stopRedisTestContainer(redisContainer);
		}
	});

	it('admits only one concurrent operation for an event session', async () => {
		const results = await Promise.all(
			Array.from({ length: 8 }, (_, index) =>
				acquireEventSessionOperationLock({
					eventSessionId: 42,
					token: `token-${index}`,
					ttlMs: 1_000
				})
			)
		);

		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it('allows only the token owner to release the lock', async () => {
		await expect(
			acquireEventSessionOperationLock({
				eventSessionId: 43,
				token: 'owner-token',
				ttlMs: 1_000
			})
		).resolves.toBe(true);
		await expect(releaseEventSessionOperationLock({ eventSessionId: 43, token: 'other-token' })).resolves.toBe(false);
		await expect(
			acquireEventSessionOperationLock({
				eventSessionId: 43,
				token: 'next-token',
				ttlMs: 1_000
			})
		).resolves.toBe(false);
		await expect(releaseEventSessionOperationLock({ eventSessionId: 43, token: 'owner-token' })).resolves.toBe(true);
		await expect(
			acquireEventSessionOperationLock({
				eventSessionId: 43,
				token: 'next-token',
				ttlMs: 1_000
			})
		).resolves.toBe(true);
	});

	it('allows only the token owner to renew the lock', async () => {
		await expect(
			acquireEventSessionOperationLock({
				eventSessionId: 45,
				token: 'owner-token',
				ttlMs: 1_000
			})
		).resolves.toBe(true);

		await expect(
			renewEventSessionOperationLock({
				eventSessionId: 45,
				token: 'other-token',
				ttlMs: 1_000
			})
		).resolves.toBe(false);
		await expect(
			renewEventSessionOperationLock({
				eventSessionId: 45,
				token: 'owner-token',
				ttlMs: 1_000
			})
		).resolves.toBe(true);
	});

	it('keeps a token-owned lease exclusive beyond its original TTL', async () => {
		await expect(
			acquireEventSessionOperationLock({
				eventSessionId: 46,
				token: 'lease-token',
				ttlMs: 100
			})
		).resolves.toBe(true);
		const lease = startEventSessionOperationLockLease({
			eventSessionId: 46,
			token: 'lease-token',
			ttlMs: 100,
			renewIntervalMs: 20
		});

		await new Promise((resolve) => setTimeout(resolve, 180));

		await expect(
			acquireEventSessionOperationLock({
				eventSessionId: 46,
				token: 'competing-token',
				ttlMs: 1_000
			})
		).resolves.toBe(false);
		await lease.stop();
		await expect(releaseEventSessionOperationLock({ eventSessionId: 46, token: 'lease-token' })).resolves.toBe(true);
	});

	it('recovers after an expired lock holder', async () => {
		await expect(
			acquireEventSessionOperationLock({
				eventSessionId: 44,
				token: 'expired-token',
				ttlMs: 25
			})
		).resolves.toBe(true);

		await new Promise((resolve) => setTimeout(resolve, 50));

		await expect(
			acquireEventSessionOperationLock({
				eventSessionId: 44,
				token: 'recovery-token',
				ttlMs: 1_000
			})
		).resolves.toBe(true);
		await expect(releaseEventSessionOperationLock({ eventSessionId: 44, token: 'expired-token' })).resolves.toBe(false);
	});
});
