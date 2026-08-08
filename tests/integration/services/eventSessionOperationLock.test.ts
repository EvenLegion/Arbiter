import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { flushRedisDatabase } from '../setup/redis';
import { applyRedisTestEnv, startRedisTestContainer, stopRedisTestContainer } from '../setup/testcontainers';

describe('event-session operation lock integration', () => {
	let redisUrl: string;
	let redisContainer: Awaited<ReturnType<typeof startRedisTestContainer>>['redis'];
	let acquireEventSessionOperationLock: typeof import('../../../src/integrations/redis/eventSessionOperationLock').acquireEventSessionOperationLock;
	let releaseEventSessionOperationLock: typeof import('../../../src/integrations/redis/eventSessionOperationLock').releaseEventSessionOperationLock;
	let closeRedisClient: typeof import('../../../src/integrations/redis/client').closeRedisClient;

	beforeAll(async () => {
		const started = await startRedisTestContainer();
		redisContainer = started.redis;
		redisUrl = started.redisUrl;
		applyRedisTestEnv(redisUrl);
		vi.resetModules();
		({ acquireEventSessionOperationLock, releaseEventSessionOperationLock } =
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
