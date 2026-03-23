import { EventReviewDecisionKind, EventSessionChannelKind, EventSessionMessageKind, EventSessionState, MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	activateDraftEvent,
	cancelDraftEvent,
	createEventDraft,
	finalizeEventReviewLifecycle,
	initializeEventReviewState,
	type EventLifecycleEventSession
} from '../../../src/lib/services/event-lifecycle';
import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { flushRedisDatabase } from '../setup/redis';
import { applyIntegrationTestEnv, startIntegrationContainers, stopIntegrationContainers, type IntegrationContainers } from '../setup/testcontainers';

describe('eventLifecycle integration', () => {
	let containers: IntegrationContainers;
	let standalone: StandalonePrisma;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;
	let eventRepository: typeof import('../../../src/integrations/prisma/repositories').eventRepository;
	let eventReviewRepository: typeof import('../../../src/integrations/prisma/repositories').eventReviewRepository;
	let closeRedisClient: typeof import('../../../src/integrations/redis/client').closeRedisClient;
	let startTrackingSession: typeof import('../../../src/integrations/redis/eventTracking').startTrackingSession;
	let applyTrackingTick: typeof import('../../../src/integrations/redis/eventTracking').applyTrackingTick;
	let clearTrackingSession: typeof import('../../../src/integrations/redis/eventTracking').clearTrackingSession;
	let getTrackingParticipantsSnapshot: typeof import('../../../src/integrations/redis/eventTracking').getTrackingParticipantsSnapshot;

	beforeAll(async () => {
		containers = await startIntegrationContainers();
		applyIntegrationTestEnv(containers);
		pushPrismaSchema(containers.databaseUrl);
		standalone = createStandalonePrisma(containers.databaseUrl);
		vi.resetModules();
		({ closeDb } = await import('../../../src/integrations/prisma'));
		({ eventRepository, eventReviewRepository } = await import('../../../src/integrations/prisma/repositories'));
		({ closeRedisClient } = await import('../../../src/integrations/redis/client'));
		({ startTrackingSession, applyTrackingTick, clearTrackingSession, getTrackingParticipantsSnapshot } =
			await import('../../../src/integrations/redis/eventTracking'));
	});

	beforeEach(async () => {
		await resetDatabase(standalone.prisma);
		await seedReferenceData(standalone.prisma);
		await flushRedisDatabase(containers.redisUrl);
	});

	afterAll(async () => {
		if (closeRedisClient) {
			await closeRedisClient().catch(() => undefined);
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

	it('creates a draft event and persists tracking channels and message refs', async () => {
		const host = await createUser(standalone.prisma, {
			discordUserId: '5401',
			discordUsername: 'draft-host'
		});
		const eventTier = await standalone.prisma.eventTier.findUniqueOrThrow({
			where: {
				code: MeritTypeCode.TIER_2
			}
		});

		const result = await createEventDraft(
			{
				findEventTier: async (eventTierId) =>
					eventRepository.getEventTierById({
						where: {
							id: eventTierId
						}
					}),
				renamePrimaryVoiceChannel: vi.fn().mockResolvedValue(undefined),
				createTrackingThread: async () => ({
					threadId: 'tracking-thread-5401'
				}),
				createDraftEventSession: eventRepository.createDraftSession,
				saveEventThreadChannel: async (params) => {
					await eventRepository.upsertSessionChannel({
						eventSessionId: params.eventSessionId,
						channelId: params.threadId,
						kind: EventSessionChannelKind.EVENT_THREAD,
						addedByDbUserId: params.addedByDbUserId
					});
				},
				postTrackingSummary: async () => ({
					threadSummaryMessageId: 'thread-summary-5401',
					parentVoiceSummaryMessageId: 'parent-summary-5401'
				}),
				postThreadAnnouncement: vi.fn().mockResolvedValue(undefined),
				saveTrackingMessageRef: async ({ eventSessionId, channelId, messageId }) => {
					await eventRepository.upsertSessionMessageRef({
						eventSessionId,
						kind: EventSessionMessageKind.TRACKING_SUMMARY,
						channelId,
						messageId
					});
				},
				saveParentVoiceSummaryMessageRef: async ({ eventSessionId, channelId, messageId }) => {
					await eventRepository.upsertSessionMessageRef({
						eventSessionId,
						kind: EventSessionMessageKind.TRACKING_SUMMARY_PARENT_VC,
						channelId,
						messageId
					});
				},
				cleanupTrackingThread: vi.fn().mockResolvedValue(undefined)
			},
			{
				hostDbUserId: host.id,
				hostDiscordUserId: host.discordUserId,
				issuerTag: 'Host#5401',
				eventTierId: eventTier.id,
				eventName: 'Draft Service Event',
				primaryVoiceChannelId: 'parent-vc-5401'
			}
		);

		expect(result).toEqual({
			kind: 'draft_created',
			eventSessionId: 1,
			trackingThreadId: 'tracking-thread-5401'
		});
		await expect(
			standalone.prisma.event.findUniqueOrThrow({
				where: {
					id: result.eventSessionId
				},
				include: {
					channels: true,
					eventMessages: true
				}
			})
		).resolves.toMatchObject({
			name: 'Draft Service Event',
			state: EventSessionState.DRAFT,
			channels: expect.arrayContaining([
				expect.objectContaining({
					channelId: 'parent-vc-5401',
					kind: EventSessionChannelKind.PARENT_VC
				}),
				expect.objectContaining({
					channelId: 'tracking-thread-5401',
					kind: EventSessionChannelKind.EVENT_THREAD
				})
			]),
			eventMessages: expect.arrayContaining([
				expect.objectContaining({
					channelId: 'tracking-thread-5401',
					kind: EventSessionMessageKind.TRACKING_SUMMARY
				}),
				expect.objectContaining({
					channelId: 'parent-vc-5401',
					kind: EventSessionMessageKind.TRACKING_SUMMARY_PARENT_VC
				})
			])
		});
	});

	it('activates and cancels draft events through the real state persistence layer', async () => {
		const host = await createUser(standalone.prisma, {
			discordUserId: '5402',
			discordUsername: 'transition-host'
		});
		const draftToActivate = await createEventSession(standalone.prisma, {
			hostUserId: host.id,
			threadId: 'thread-5402a',
			name: 'Activate Me',
			state: EventSessionState.DRAFT,
			eventTierCode: MeritTypeCode.TIER_1
		});
		await standalone.prisma.eventChannel.create({
			data: {
				eventSessionId: draftToActivate.id,
				channelId: 'parent-vc-5402a',
				kind: EventSessionChannelKind.PARENT_VC,
				addedByUserId: host.id
			}
		});

		const activated = await activateDraftEvent(createTransitionDeps(), {
			actor: buildActor(host.discordUserId, host.id),
			eventSessionId: draftToActivate.id
		});

		expect(activated).toMatchObject({
			kind: 'activated',
			eventSession: expect.objectContaining({
				id: draftToActivate.id,
				state: EventSessionState.ACTIVE
			})
		});
		await expect(
			standalone.prisma.event.findUniqueOrThrow({
				where: {
					id: draftToActivate.id
				}
			})
		).resolves.toMatchObject({
			state: EventSessionState.ACTIVE
		});

		const draftToCancel = await createEventSession(standalone.prisma, {
			hostUserId: host.id,
			threadId: 'thread-5402b',
			name: 'Cancel Me',
			state: EventSessionState.DRAFT,
			eventTierCode: MeritTypeCode.TIER_1
		});
		await standalone.prisma.eventChannel.create({
			data: {
				eventSessionId: draftToCancel.id,
				channelId: 'parent-vc-5402b',
				kind: EventSessionChannelKind.PARENT_VC,
				addedByUserId: host.id
			}
		});

		const cancelled = await cancelDraftEvent(createTransitionDeps(), {
			actor: buildActor(host.discordUserId, host.id),
			eventSessionId: draftToCancel.id
		});

		expect(cancelled).toMatchObject({
			kind: 'cancelled',
			eventSession: expect.objectContaining({
				id: draftToCancel.id,
				state: EventSessionState.CANCELLED
			})
		});
	});

	it('initializes review state from Redis participant snapshots', async () => {
		const host = await createUser(standalone.prisma, {
			discordUserId: '5403',
			discordUsername: 'review-host'
		});
		const attendee = await createUser(standalone.prisma, {
			discordUserId: '5404',
			discordUsername: 'review-attendee'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: host.id,
			threadId: 'thread-5403',
			name: 'Initialize Review',
			state: EventSessionState.ENDED_PENDING_REVIEW,
			eventTierCode: MeritTypeCode.TIER_3,
			startedAt: new Date('2026-03-15T10:00:00.000Z'),
			endedAt: new Date('2026-03-15T11:00:00.000Z')
		});

		await startTrackingSession({
			eventSessionId: eventSession.id,
			guildId: 'guild-5403',
			startedAtMs: Date.parse('2026-03-15T10:00:00.000Z')
		});
		await applyTrackingTick({
			eventSessionId: eventSession.id,
			attendeeDiscordUserIds: [attendee.discordUserId],
			tickDurationSeconds: 3600,
			tickedAtMs: Date.parse('2026-03-15T11:00:00.000Z')
		});

		const result = await initializeEventReviewState(
			{
				findEventSession: async (eventSessionId) =>
					standalone.prisma.event.findUnique({
						where: {
							id: eventSessionId
						},
						select: {
							id: true,
							state: true,
							startedAt: true,
							endedAt: true
						}
					}),
				getTrackingParticipantsSnapshot: async (eventSessionId) =>
					getTrackingParticipantsSnapshot({
						eventSessionId
					}),
				findUsersByDiscordUserIds: async (discordUserIds) =>
					standalone.prisma.user.findMany({
						where: {
							discordUserId: {
								in: discordUserIds
							}
						},
						select: {
							id: true,
							discordUserId: true
						}
					}),
				upsertParticipantStats: eventReviewRepository.upsertParticipantStats,
				upsertReviewDecisions: eventReviewRepository.upsertReviewDecisions,
				clearTrackingSession: async (eventSessionId) => {
					await clearTrackingSession({
						eventSessionId
					});
				},
				syncReviewMessage: vi.fn().mockResolvedValue(true),
				defaultMinAttendancePercent: 60
			},
			{
				eventSessionId: eventSession.id
			}
		);

		expect(result).toEqual({
			kind: 'review_initialized',
			durationSeconds: 3600,
			snapshotParticipantCount: 1,
			persistedParticipantCount: 1
		});
		await expect(
			standalone.prisma.eventParticipantStat.findMany({
				where: {
					eventSessionId: eventSession.id
				}
			})
		).resolves.toEqual([
			expect.objectContaining({
				userId: attendee.id,
				attendedSeconds: 3600
			})
		]);
		await expect(
			getTrackingParticipantsSnapshot({
				eventSessionId: eventSession.id
			})
		).resolves.toEqual([]);
	});

	it('finalizes review and persists merit awards through the service lifecycle wrapper', async () => {
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '5405',
			discordUsername: 'final-reviewer'
		});
		const attendee = await createUser(standalone.prisma, {
			discordUserId: '5406',
			discordUsername: 'final-attendee'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: reviewer.id,
			threadId: 'thread-5405',
			name: 'Finalize Review',
			state: EventSessionState.ENDED_PENDING_REVIEW,
			eventTierCode: MeritTypeCode.TIER_2
		});
		await standalone.prisma.eventChannel.createMany({
			data: [
				{
					eventSessionId: eventSession.id,
					channelId: 'parent-vc-5405',
					kind: EventSessionChannelKind.PARENT_VC,
					addedByUserId: reviewer.id
				},
				{
					eventSessionId: eventSession.id,
					channelId: 'child-vc-5405',
					kind: EventSessionChannelKind.CHILD_VC,
					addedByUserId: reviewer.id
				}
			]
		});
		await standalone.prisma.eventReviewDecision.create({
			data: {
				eventSessionId: eventSession.id,
				targetUserId: attendee.id,
				decision: EventReviewDecisionKind.MERIT
			}
		});

		const result = await finalizeEventReviewLifecycle(
			{
				findEventSession: async (eventSessionId) =>
					standalone.prisma.event.findUnique({
						where: {
							id: eventSessionId
						},
						select: {
							id: true,
							state: true
						}
					}),
				finalizeReview: eventReviewRepository.finalizeReview,
				syncAwardedNicknames: vi.fn().mockResolvedValue(undefined),
				reloadEventSession: loadEventLifecycleEventSession,
				syncTrackingSummary: vi.fn().mockResolvedValue(undefined),
				postReviewSubmissionMessages: vi.fn().mockResolvedValue(undefined),
				deleteTrackedChannelRows: async (eventSessionId) =>
					eventRepository.deleteSessionChannels({
						eventSessionId,
						kinds: [EventSessionChannelKind.PARENT_VC, EventSessionChannelKind.CHILD_VC]
					}),
				syncReviewMessage: vi.fn().mockResolvedValue(true)
			},
			{
				actor: buildActor(reviewer.discordUserId, reviewer.id),
				eventSessionId: eventSession.id,
				mode: 'with'
			}
		);

		expect(result).toEqual({
			kind: 'review_finalized',
			toState: EventSessionState.FINALIZED_WITH_MERITS,
			awardedCount: 1,
			reviewMessageSynced: true
		});
		await expect(
			standalone.prisma.event.findUniqueOrThrow({
				where: {
					id: eventSession.id
				}
			})
		).resolves.toMatchObject({
			state: EventSessionState.FINALIZED_WITH_MERITS,
			reviewFinalizedByUserId: reviewer.id
		});
		await expect(
			standalone.prisma.merit.findMany({
				where: {
					eventSessionId: eventSession.id
				}
			})
		).resolves.toEqual([
			expect.objectContaining({
				userId: attendee.id,
				awardedByUserId: reviewer.id
			})
		]);
	});

	function createTransitionDeps() {
		return {
			findEventSession: loadEventLifecycleEventSession,
			updateState: eventRepository.updateSessionState,
			reloadEventSession: loadEventLifecycleEventSession,
			syncLifecyclePresentation: vi.fn().mockResolvedValue(undefined),
			startTracking: vi.fn().mockResolvedValue(undefined),
			now: vi.fn().mockReturnValue(new Date('2026-03-15T10:00:00.000Z'))
		};
	}

	async function loadEventLifecycleEventSession(eventSessionId: number): Promise<EventLifecycleEventSession | null> {
		return standalone.prisma.event.findUnique({
			where: {
				id: eventSessionId
			},
			include: {
				hostUser: true,
				eventTier: {
					include: {
						meritType: true
					}
				},
				channels: true,
				eventMessages: true
			}
		}) as Promise<EventLifecycleEventSession | null>;
	}
});

function buildActor(discordUserId: string, dbUserId: string) {
	return {
		discordUserId,
		dbUserId,
		capabilities: {
			isStaff: true,
			isCenturion: false,
			isOptio: false
		}
	};
}
