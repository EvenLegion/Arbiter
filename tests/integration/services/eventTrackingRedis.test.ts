import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { flushRedisDatabase } from '../setup/redis';
import { applyRedisTestEnv, startRedisTestContainer, stopRedisTestContainer } from '../setup/testcontainers';

describe('event tracking Redis integration', () => {
	let redisUrl: string;
	let redisContainer: Awaited<ReturnType<typeof startRedisTestContainer>>['redis'];
	let startTrackingSession: typeof import('../../../src/integrations/redis/eventTracking').startTrackingSession;
	let applyTrackingTick: typeof import('../../../src/integrations/redis/eventTracking').applyTrackingTick;
	let getTrackingParticipantsSnapshot: typeof import('../../../src/integrations/redis/eventTracking').getTrackingParticipantsSnapshot;
	let listActiveTrackingSessionIds: typeof import('../../../src/integrations/redis/eventTracking').listActiveTrackingSessionIds;
	let stopTrackingSession: typeof import('../../../src/integrations/redis/eventTracking').stopTrackingSession;
	let clearTrackingSession: typeof import('../../../src/integrations/redis/eventTracking').clearTrackingSession;
	let closeRedisClient: typeof import('../../../src/integrations/redis/client').closeRedisClient;

	beforeAll(async () => {
		const started = await startRedisTestContainer();
		redisContainer = started.redis;
		redisUrl = started.redisUrl;
		applyRedisTestEnv(redisUrl);
		vi.resetModules();
		({
			startTrackingSession,
			applyTrackingTick,
			getTrackingParticipantsSnapshot,
			listActiveTrackingSessionIds,
			stopTrackingSession,
			clearTrackingSession
		} = await import('../../../src/integrations/redis/eventTracking'));
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

	it('tracks participants across ticks and removes the session when cleared', async () => {
		await startTrackingSession({
			eventSessionId: 77,
			guildId: 'guild-1',
			startedAtMs: 1_710_000_000_000
		});

		expect(await listActiveTrackingSessionIds()).toEqual([77]);

		const firstTick = await applyTrackingTick({
			eventSessionId: 77,
			attendeeDiscordUserIds: ['user-a', 'user-b', 'user-a'],
			tickDurationSeconds: 15,
			tickedAtMs: 1_710_000_000_015
		});
		expect(firstTick).toEqual({
			applied: true,
			incrementedParticipantCount: 2
		});

		const secondTick = await applyTrackingTick({
			eventSessionId: 77,
			attendeeDiscordUserIds: ['user-a'],
			tickDurationSeconds: 15,
			tickedAtMs: 1_710_000_000_030
		});
		expect(secondTick).toEqual({
			applied: true,
			incrementedParticipantCount: 1
		});

		expect(await getTrackingParticipantsSnapshot({ eventSessionId: 77 })).toEqual([
			{
				discordUserId: 'user-a',
				attendedSeconds: 30
			},
			{
				discordUserId: 'user-b',
				attendedSeconds: 15
			}
		]);

		expect(
			await stopTrackingSession({
				eventSessionId: 77,
				stoppedAtMs: 1_710_000_000_045
			})
		).toBe(true);
		expect(await listActiveTrackingSessionIds()).toEqual([]);

		await clearTrackingSession({
			eventSessionId: 77
		});
		expect(await getTrackingParticipantsSnapshot({ eventSessionId: 77 })).toEqual([]);
	});

	it('rejects ticks for sessions that are not active', async () => {
		expect(
			await applyTrackingTick({
				eventSessionId: 88,
				attendeeDiscordUserIds: ['user-c'],
				tickDurationSeconds: 10,
				tickedAtMs: 1_710_000_100_000
			})
		).toEqual({
			applied: false,
			incrementedParticipantCount: 0
		});
	});
});
