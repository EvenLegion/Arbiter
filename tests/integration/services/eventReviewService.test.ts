import { EventReviewDecisionKind, EventSessionState, MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadEventReviewPage, recordEventReviewDecision } from '../../../src/lib/services/event-review/eventReviewService';
import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('eventReviewService integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let eventReviewRepository: typeof import('../../../src/integrations/prisma/repositories').eventReviewRepository;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ closeDb } = await import('../../../src/integrations/prisma'));
		({ eventReviewRepository } = await import('../../../src/integrations/prisma/repositories'));
	});

	beforeEach(async () => {
		await resetDatabase(standalone.prisma);
		await seedReferenceData(standalone.prisma);
	});

	afterAll(async () => {
		if (closeDb) {
			await closeDb();
		}
		if (standalone) {
			await standalone.close();
		}
		if (postgresContainer) {
			await stopPostgresTestContainer(postgresContainer);
		}
	});

	it('records a review decision and persists it through the service', async () => {
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '5201',
			discordUsername: 'reviewer'
		});
		const attendee = await createUser(standalone.prisma, {
			discordUserId: '5202',
			discordUsername: 'attendee'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: reviewer.id,
			threadId: 'thread-5201',
			name: 'Review Pending',
			state: EventSessionState.ENDED_PENDING_REVIEW,
			eventTierCode: MeritTypeCode.TIER_2
		});

		const result = await recordEventReviewDecision(
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
				saveDecision: eventReviewRepository.upsertDecision,
				syncReviewMessage: vi.fn().mockResolvedValue(true)
			},
			{
				actor: {
					discordUserId: reviewer.discordUserId,
					dbUserId: reviewer.id,
					capabilities: {
						isStaff: true,
						isCenturion: false
					}
				},
				eventSessionId: eventSession.id,
				targetDbUserId: attendee.id,
				decision: EventReviewDecisionKind.MERIT,
				page: 1
			}
		);

		expect(result).toEqual({
			kind: 'decision_saved',
			synced: true
		});
		await expect(
			standalone.prisma.eventReviewDecision.findMany({
				where: {
					eventSessionId: eventSession.id
				}
			})
		).resolves.toEqual([
			expect.objectContaining({
				targetUserId: attendee.id,
				decision: EventReviewDecisionKind.MERIT
			})
		]);
	});

	it('loads a paged review model from real participant and decision rows', async () => {
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '5203',
			discordUsername: 'reviewer-page'
		});
		const attendee = await createUser(standalone.prisma, {
			discordUserId: '5204',
			discordUsername: 'attendee-page',
			discordNickname: 'Attendee Page'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: reviewer.id,
			threadId: 'thread-5203',
			name: 'Paged Review',
			state: EventSessionState.ENDED_PENDING_REVIEW,
			eventTierCode: MeritTypeCode.TIER_1,
			startedAt: new Date('2026-03-15T10:00:00.000Z'),
			endedAt: new Date('2026-03-15T11:00:00.000Z')
		});
		await standalone.prisma.eventParticipantStat.create({
			data: {
				eventSessionId: eventSession.id,
				userId: attendee.id,
				attendedSeconds: 3600
			}
		});
		await standalone.prisma.eventReviewDecision.create({
			data: {
				eventSessionId: eventSession.id,
				targetUserId: attendee.id,
				decision: EventReviewDecisionKind.MERIT
			}
		});

		const result = await loadEventReviewPage(
			{
				getReviewPage: eventReviewRepository.getReviewPage
			},
			{
				eventSessionId: eventSession.id,
				page: 1
			}
		);

		expect(result).toEqual({
			kind: 'page_ready',
			reviewPage: expect.objectContaining({
				eventSession: expect.objectContaining({
					id: eventSession.id,
					state: EventSessionState.ENDED_PENDING_REVIEW
				}),
				attendeeCount: 1,
				page: 1,
				attendees: [
					expect.objectContaining({
						dbUserId: attendee.id,
						discordUserId: attendee.discordUserId,
						decision: EventReviewDecisionKind.MERIT
					})
				]
			})
		});
	});

	it('locks decision writes once the event is finalized', async () => {
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '5205',
			discordUsername: 'reviewer-locked'
		});
		const attendee = await createUser(standalone.prisma, {
			discordUserId: '5206',
			discordUsername: 'attendee-locked'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: reviewer.id,
			threadId: 'thread-5205',
			name: 'Finalized Review',
			state: EventSessionState.FINALIZED_WITH_MERITS,
			eventTierCode: MeritTypeCode.TIER_3
		});

		const result = await recordEventReviewDecision(
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
				saveDecision: eventReviewRepository.upsertDecision,
				syncReviewMessage: vi.fn().mockResolvedValue(true)
			},
			{
				actor: {
					discordUserId: reviewer.discordUserId,
					dbUserId: reviewer.id,
					capabilities: {
						isStaff: true,
						isCenturion: false
					}
				},
				eventSessionId: eventSession.id,
				targetDbUserId: attendee.id,
				decision: EventReviewDecisionKind.NO_MERIT,
				page: 1
			}
		);

		expect(result).toEqual({
			kind: 'review_locked',
			currentState: EventSessionState.FINALIZED_WITH_MERITS
		});
		await expect(
			standalone.prisma.eventReviewDecision.count({
				where: {
					eventSessionId: eventSession.id
				}
			})
		).resolves.toBe(0);
	});
});
