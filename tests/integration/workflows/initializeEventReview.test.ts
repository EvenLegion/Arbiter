import { EventReviewDecisionKind, EventSessionChannelKind, EventSessionState, MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, deployPrismaMigrations, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
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
import { tickTrackedEventSession } from '../../../src/lib/services/event-tracking/eventTrackingService';
import { MissingTrackedChannelWarningStore } from '../../../src/lib/services/event-tracking/missingTrackedChannelWarningStore';
import { recordEventReviewDecision } from '../../../src/lib/services/event-review/eventReviewService';

describe('initializeEventReview integration', () => {
	let containers: IntegrationContainers;
	let standalone: StandalonePrisma;
	let initializeEventReview: typeof import('../../../src/lib/features/event-merit/review/initialization/initializeEventReview').initializeEventReview;
	let startTrackingSession: typeof import('../../../src/integrations/redis/eventTracking').startTrackingSession;
	let applyTrackingTick: typeof import('../../../src/integrations/redis/eventTracking').applyTrackingTick;
	let getTrackingParticipantsSnapshot: typeof import('../../../src/integrations/redis/eventTracking').getTrackingParticipantsSnapshot;
	let stopTrackingSession: typeof import('../../../src/integrations/redis/eventTracking').stopTrackingSession;
	let eventRepository: typeof import('../../../src/integrations/prisma/repositories').eventRepository;
	let eventReviewRepository: typeof import('../../../src/integrations/prisma/repositories').eventReviewRepository;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;
	let closeRedisClient: typeof import('../../../src/integrations/redis/client').closeRedisClient;
	const syncEventReviewPresentation = vi.fn();

	beforeAll(async () => {
		containers = await startIntegrationContainers();
		applyIntegrationTestEnv(containers);
		applyDiscordTestEnv({
			EVENT_MERIT_DEFAULT_MIN_ATTENDANCE_PCT: '60'
		});
		deployPrismaMigrations(containers.databaseUrl);
		standalone = createStandalonePrisma(containers.databaseUrl);
		vi.resetModules();
		vi.doMock('../../../src/lib/features/event-merit/presentation/syncEventReviewPresentation', () => ({
			syncEventReviewPresentation
		}));
		({ initializeEventReview } = await import('../../../src/lib/features/event-merit/review/initialization/initializeEventReview'));
		({ startTrackingSession, applyTrackingTick, getTrackingParticipantsSnapshot, stopTrackingSession } =
			await import('../../../src/integrations/redis/eventTracking'));
		({ closeDb } = await import('../../../src/integrations/prisma'));
		({ eventRepository, eventReviewRepository } = await import('../../../src/integrations/prisma/repositories'));
		({ closeRedisClient } = await import('../../../src/integrations/redis/client'));
	});

	beforeEach(async () => {
		syncEventReviewPresentation.mockReset().mockResolvedValue(true);
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

	it.each([60, 90, 120, 150, 180])('persists %i minutes through draft, activation, end, and fresh review reads', async (expectedEventDuration) => {
		const host = await createUser(standalone.prisma, { discordUserId: 'duration-host' });
		const tier = await standalone.prisma.eventTier.findUniqueOrThrow({ where: { code: MeritTypeCode.TIER_1 } });
		const draft = await eventRepository.createDraftSession({
			hostDbUserId: host.id,
			eventTierId: tier.id,
			threadId: 'duration-thread',
			name: 'Persisted Duration',
			expectedEventDuration,
			primaryChannelId: 'parent-vc',
			addedByDbUserId: host.id
		});
		expect(draft.expectedEventDuration).toBe(expectedEventDuration);
		await eventRepository.updateSessionState({
			eventSessionId: draft.id,
			fromState: EventSessionState.DRAFT,
			toState: EventSessionState.ACTIVE,
			data: { startedAt: new Date(0) }
		});
		await eventRepository.updateSessionState({
			eventSessionId: draft.id,
			fromState: EventSessionState.ACTIVE,
			toState: EventSessionState.ENDED_PENDING_REVIEW,
			data: { endedAt: new Date(7_200_000) }
		});
		// A separate Prisma connection reads the durable value, independent of draft/runtime objects.
		await expect(standalone.prisma.event.findUniqueOrThrow({ where: { id: draft.id } })).resolves.toMatchObject({ expectedEventDuration });
		await expect(eventReviewRepository.getReviewPage({ eventSessionId: draft.id })).resolves.toMatchObject({
			eventSession: { expectedEventDuration }
		});
	});

	it('aggregates reconnects and child VCs once, preserves overrides on retry, and finalizes only once', async () => {
		const host = await createUser(standalone.prisma, { discordUserId: 'tracking-host' });
		const atHalf = await createUser(standalone.prisma, { discordUserId: 'at-half' });
		const underHalf = await createUser(standalone.prisma, { discordUserId: 'under-half' });
		const event = await createEventSession(standalone.prisma, {
			hostUserId: host.id,
			threadId: 'tracking-thread',
			name: 'Tracked Duration',
			expectedEventDuration: 60
		});
		for (const [channelId, kind] of [
			['parent-vc', EventSessionChannelKind.PARENT_VC],
			['child-vc', EventSessionChannelKind.CHILD_VC]
		] as const) {
			await eventRepository.upsertSessionChannel({ eventSessionId: event.id, channelId, kind, addedByDbUserId: host.id });
		}
		const channelMembers = new Map<string, string[]>();
		const trackingDeps = {
			resolveVoiceChannel: async ({ channelId }: { channelId: string }) => ({
				members: new Map((channelMembers.get(channelId) ?? []).map((id) => [id, { id, user: { bot: false } }]))
			}),
			applyTrackingTick,
			tickDurationSeconds: 600,
			warningStore: new MissingTrackedChannelWarningStore()
		};
		const tick = async () => {
			const session = await eventRepository.getSession({ eventSessionId: event.id, include: { channels: true } });
			if (!session) throw new Error('Missing fixture event');
			return tickTrackedEventSession(trackingDeps, { guild: {} as never, session, context: createMockExecutionContext() });
		};
		channelMembers.set('parent-vc', [atHalf.discordUserId]);
		expect((await tick()).applied).toBe(false);
		await eventRepository.updateSessionState({
			eventSessionId: event.id,
			fromState: EventSessionState.DRAFT,
			toState: EventSessionState.ACTIVE,
			data: { startedAt: new Date(0) }
		});
		await startTrackingSession({ eventSessionId: event.id, guildId: 'guild', startedAtMs: 0 });
		await tick();
		channelMembers.clear(); // Disconnect: no credit while absent.
		await tick();
		channelMembers.set('child-vc', [atHalf.discordUserId]);
		await tick(); // Reconnect in the child VC.
		channelMembers.set('parent-vc', [atHalf.discordUserId]);
		await tick(); // Same member in both snapshots still receives just one tick.
		channelMembers.clear();
		channelMembers.set('child-vc', [underHalf.discordUserId]);
		trackingDeps.tickDurationSeconds = 1799;
		await tick();
		await eventRepository.updateSessionState({
			eventSessionId: event.id,
			fromState: EventSessionState.ACTIVE,
			toState: EventSessionState.ENDED_PENDING_REVIEW,
			data: { endedAt: new Date(7_200_000) }
		});
		expect((await tick()).applied).toBe(false);
		await stopTrackingSession({ eventSessionId: event.id });
		expect(
			(await applyTrackingTick({ eventSessionId: event.id, attendeeDiscordUserIds: [underHalf.discordUserId], tickDurationSeconds: 600 }))
				.applied
		).toBe(false);

		const initialize = () =>
			initializeEventReview({ guild: { id: 'guild' } as never, eventSessionId: event.id, context: createMockExecutionContext() });
		await initialize();
		const page = await eventReviewRepository.getReviewPage({ eventSessionId: event.id });
		expect(page?.attendees).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ dbUserId: atHalf.id, attendedSeconds: 1800, decision: EventReviewDecisionKind.MERIT }),
				expect.objectContaining({ dbUserId: underHalf.id, attendedSeconds: 1799, decision: EventReviewDecisionKind.NO_MERIT })
			])
		);
		expect(await standalone.prisma.merit.count()).toBe(0);
		for (const [targetDbUserId, decision] of [
			[atHalf.id, EventReviewDecisionKind.NO_MERIT],
			[underHalf.id, EventReviewDecisionKind.MERIT]
		] as const) {
			await recordEventReviewDecision(
				{
					findEventSession: (eventSessionId) => eventRepository.getSession({ eventSessionId }),
					saveDecision: async (params) => {
						await eventReviewRepository.upsertDecision(params);
					},
					syncReviewMessage: async () => true
				},
				{
					actor: {
						discordUserId: host.discordUserId,
						dbUserId: host.id,
						capabilities: { isStaff: true, isCenturion: false, isOptio: false }
					},
					eventSessionId: event.id,
					targetDbUserId,
					decision,
					page: 1
				}
			);
		}
		await initialize(); // Empty Redis after initialization must not reset saved decisions.
		const results = await Promise.all(
			[1, 2].map(() => eventReviewRepository.finalizeReview({ eventSessionId: event.id, reviewerDbUserId: host.id, mode: 'with' }))
		);
		expect(results.filter((result) => result.finalized)).toHaveLength(1);
		const merits = await standalone.prisma.merit.findMany({ where: { eventSessionId: event.id } });
		expect(merits.map((merit) => merit.userId).sort()).toEqual([host.id, underHalf.id].sort());
		await initialize(); // Finalized events cannot recalculate history.
		expect(await standalone.prisma.merit.count({ where: { eventSessionId: event.id } })).toBe(2);
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
		expect(syncEventReviewPresentation).toHaveBeenCalledWith(
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
		expect(syncEventReviewPresentation).not.toHaveBeenCalled();
	});
});
