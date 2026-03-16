import { EventReviewDecisionKind, EventSessionState, MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { flushRedisDatabase } from '../setup/redis';
import {
	applyDiscordTestEnv,
	applyIntegrationTestEnv,
	startIntegrationContainers,
	stopIntegrationContainers,
	type IntegrationContainers
} from '../setup/testcontainers';
import { createMockExecutionContext } from '../../support/logger';

describe('initializeEventReview integration', () => {
	let containers: IntegrationContainers;
	let standalone: StandalonePrisma;
	let initializeEventReview: typeof import('../../../src/lib/features/event-merit/review/initializeEventReview').initializeEventReview;
	let startTrackingSession: typeof import('../../../src/integrations/redis/eventTracking').startTrackingSession;
	let applyTrackingTick: typeof import('../../../src/integrations/redis/eventTracking').applyTrackingTick;
	let getTrackingParticipantsSnapshot: typeof import('../../../src/integrations/redis/eventTracking').getTrackingParticipantsSnapshot;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;
	let closeRedisClient: typeof import('../../../src/integrations/redis/client').closeRedisClient;
	const syncEventReviewMessage = vi.fn();

	beforeAll(async () => {
		containers = await startIntegrationContainers();
		applyIntegrationTestEnv(containers);
		applyDiscordTestEnv({
			EVENT_MERIT_DEFAULT_MIN_ATTENDANCE_PCT: '60'
		});
		pushPrismaSchema(containers.databaseUrl);
		standalone = createStandalonePrisma(containers.databaseUrl);
		vi.resetModules();
		vi.doMock('../../../src/lib/features/event-merit/review/syncEventReviewMessage', () => ({
			syncEventReviewMessage
		}));
		({ initializeEventReview } = await import('../../../src/lib/features/event-merit/review/initializeEventReview'));
		({ startTrackingSession, applyTrackingTick, getTrackingParticipantsSnapshot } =
			await import('../../../src/integrations/redis/eventTracking'));
		({ closeDb } = await import('../../../src/integrations/prisma'));
		({ closeRedisClient } = await import('../../../src/integrations/redis/client'));
	});

	beforeEach(async () => {
		syncEventReviewMessage.mockReset().mockResolvedValue(true);
		await resetDatabase(standalone.prisma);
		await seedReferenceData(standalone.prisma);
		await flushRedisDatabase(containers.redisUrl);
	});

	afterAll(async () => {
		if (closeRedisClient) {
			await closeRedisClient();
		}
		if (closeDb) {
			await closeDb();
		}
		if (standalone) {
			await standalone.close();
		}
		if (containers) {
			await stopIntegrationContainers(containers);
		}
	});

	it('persists participant stats and default review decisions from Redis snapshots', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '4601',
			discordUsername: 'init-host'
		});
		const attendeeA = await createUser(standalone.prisma, {
			discordUserId: '4602',
			discordUsername: 'init-a'
		});
		const attendeeB = await createUser(standalone.prisma, {
			discordUserId: '4603',
			discordUsername: 'init-b'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-4601',
			name: 'Initialize Review',
			state: EventSessionState.ENDED_PENDING_REVIEW,
			eventTierCode: MeritTypeCode.TIER_3,
			startedAt: new Date('2026-03-14T10:00:00.000Z'),
			endedAt: new Date('2026-03-14T11:00:00.000Z')
		});

		await startTrackingSession({
			eventSessionId: eventSession.id,
			guildId: 'guild-4601',
			startedAtMs: Date.parse('2026-03-14T10:00:00.000Z')
		});
		await applyTrackingTick({
			eventSessionId: eventSession.id,
			attendeeDiscordUserIds: [attendeeA.discordUserId, attendeeB.discordUserId],
			tickDurationSeconds: 1200,
			tickedAtMs: Date.parse('2026-03-14T10:20:00.000Z')
		});
		await applyTrackingTick({
			eventSessionId: eventSession.id,
			attendeeDiscordUserIds: [attendeeA.discordUserId, 'missing-discord-user'],
			tickDurationSeconds: 3000,
			tickedAtMs: Date.parse('2026-03-14T11:10:00.000Z')
		});

		await initializeEventReview({
			guild: { id: 'guild-4601' } as never,
			eventSessionId: eventSession.id,
			context: createMockExecutionContext()
		});

		await expect(
			standalone.prisma.eventParticipantStat.findMany({
				where: {
					eventSessionId: eventSession.id
				},
				orderBy: {
					attendedSeconds: 'desc'
				}
			})
		).resolves.toEqual([
			expect.objectContaining({
				userId: attendeeA.id,
				attendedSeconds: 3600
			}),
			expect.objectContaining({
				userId: attendeeB.id,
				attendedSeconds: 1200
			})
		]);
		await expect(
			standalone.prisma.eventReviewDecision.findMany({
				where: {
					eventSessionId: eventSession.id
				}
			})
		).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					targetUserId: attendeeA.id,
					decision: EventReviewDecisionKind.MERIT
				}),
				expect.objectContaining({
					targetUserId: attendeeB.id,
					decision: EventReviewDecisionKind.NO_MERIT
				})
			])
		);
		await expect(
			getTrackingParticipantsSnapshot({
				eventSessionId: eventSession.id
			})
		).resolves.toEqual([]);
		expect(syncEventReviewMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				eventSessionId: eventSession.id,
				page: 1
			})
		);
	});

	it('no-ops for events that are not pending review', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '4604',
			discordUsername: 'active-host'
		});
		const attendee = await createUser(standalone.prisma, {
			discordUserId: '4605',
			discordUsername: 'active-attendee'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-4604',
			name: 'Still Active',
			state: EventSessionState.ACTIVE,
			eventTierCode: MeritTypeCode.TIER_1,
			startedAt: new Date('2026-03-14T12:00:00.000Z')
		});

		await startTrackingSession({
			eventSessionId: eventSession.id,
			guildId: 'guild-4604',
			startedAtMs: Date.parse('2026-03-14T12:00:00.000Z')
		});
		await applyTrackingTick({
			eventSessionId: eventSession.id,
			attendeeDiscordUserIds: [attendee.discordUserId],
			tickDurationSeconds: 900,
			tickedAtMs: Date.parse('2026-03-14T12:15:00.000Z')
		});

		await initializeEventReview({
			guild: { id: 'guild-4604' } as never,
			eventSessionId: eventSession.id,
			context: createMockExecutionContext()
		});

		await expect(
			standalone.prisma.eventParticipantStat.count({
				where: {
					eventSessionId: eventSession.id
				}
			})
		).resolves.toBe(0);
		await expect(
			getTrackingParticipantsSnapshot({
				eventSessionId: eventSession.id
			})
		).resolves.toEqual([
			{
				discordUserId: attendee.discordUserId,
				attendedSeconds: 900
			}
		]);
		expect(syncEventReviewMessage).not.toHaveBeenCalled();
	});
});
