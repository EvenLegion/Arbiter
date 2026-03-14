import { EventReviewDecisionKind, EventSessionState, MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('event review decision integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let upsertEventReviewDecision: typeof import('../../../src/integrations/prisma/event/upsertEventReviewDecision').upsertEventReviewDecision;
	let upsertManyEventReviewDecisions: typeof import('../../../src/integrations/prisma/event/upsertManyEventReviewDecisions').upsertManyEventReviewDecisions;
	let getEventReviewPage: typeof import('../../../src/integrations/prisma/event/getEventReviewPage').getEventReviewPage;
	let closeDb: typeof import('../../../src/integrations/prisma/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ upsertEventReviewDecision } = await import('../../../src/integrations/prisma/event/upsertEventReviewDecision'));
		({ upsertManyEventReviewDecisions } = await import('../../../src/integrations/prisma/event/upsertManyEventReviewDecisions'));
		({ getEventReviewPage } = await import('../../../src/integrations/prisma/event/getEventReviewPage'));
		({ closeDb } = await import('../../../src/integrations/prisma/prisma'));
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

	it('creates and updates a single review decision', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '4301',
			discordUsername: 'review-host'
		});
		const attendee = await createUser(standalone.prisma, {
			discordUserId: '4302',
			discordUsername: 'review-attendee'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-4301',
			name: 'Review Decisions',
			state: EventSessionState.ENDED_PENDING_REVIEW,
			eventTierCode: MeritTypeCode.TIER_2
		});

		await upsertEventReviewDecision({
			eventSessionId: eventSession.id,
			targetDbUserId: attendee.id,
			decision: EventReviewDecisionKind.MERIT
		});
		await upsertEventReviewDecision({
			eventSessionId: eventSession.id,
			targetDbUserId: attendee.id,
			decision: EventReviewDecisionKind.NO_MERIT
		});

		await expect(
			standalone.prisma.eventReviewDecision.findMany({
				where: {
					eventSessionId: eventSession.id
				}
			})
		).resolves.toEqual([
			expect.objectContaining({
				eventSessionId: eventSession.id,
				targetUserId: attendee.id,
				decision: EventReviewDecisionKind.NO_MERIT
			})
		]);
	});

	it('deduplicates bulk inserts and only overwrites existing decisions when requested', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '4303',
			discordUsername: 'bulk-host'
		});
		const attendeeA = await createUser(standalone.prisma, {
			discordUserId: '4304',
			discordUsername: 'bulk-a'
		});
		const attendeeB = await createUser(standalone.prisma, {
			discordUserId: '4305',
			discordUsername: 'bulk-b'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-4303',
			name: 'Bulk Decisions',
			state: EventSessionState.ENDED_PENDING_REVIEW,
			eventTierCode: MeritTypeCode.TIER_1
		});
		await standalone.prisma.eventReviewDecision.create({
			data: {
				eventSessionId: eventSession.id,
				targetUserId: attendeeA.id,
				decision: EventReviewDecisionKind.NO_MERIT
			}
		});

		await upsertManyEventReviewDecisions({
			eventSessionId: eventSession.id,
			decisions: [
				{
					targetDbUserId: attendeeA.id,
					decision: EventReviewDecisionKind.MERIT
				},
				{
					targetDbUserId: attendeeB.id,
					decision: EventReviewDecisionKind.NO_MERIT
				},
				{
					targetDbUserId: attendeeB.id,
					decision: EventReviewDecisionKind.MERIT
				}
			],
			overwriteExisting: false
		});

		await expect(
			standalone.prisma.eventReviewDecision.findMany({
				where: {
					eventSessionId: eventSession.id
				},
				orderBy: {
					createdAt: 'asc'
				}
			})
		).resolves.toEqual([
			expect.objectContaining({
				targetUserId: attendeeA.id,
				decision: EventReviewDecisionKind.NO_MERIT
			}),
			expect.objectContaining({
				targetUserId: attendeeB.id,
				decision: EventReviewDecisionKind.MERIT
			})
		]);

		await upsertManyEventReviewDecisions({
			eventSessionId: eventSession.id,
			decisions: [
				{
					targetDbUserId: attendeeA.id,
					decision: EventReviewDecisionKind.MERIT
				}
			],
			overwriteExisting: true
		});

		await expect(
			standalone.prisma.eventReviewDecision.findUniqueOrThrow({
				where: {
					eventSessionId_targetUserId: {
						eventSessionId: eventSession.id,
						targetUserId: attendeeA.id
					}
				}
			})
		).resolves.toMatchObject({
			decision: EventReviewDecisionKind.MERIT
		});
	});

	it('returns review pages with persisted decisions joined onto ordered participant stats', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '4306',
			discordUsername: 'page-host'
		});
		const attendeeA = await createUser(standalone.prisma, {
			discordUserId: '4307',
			discordUsername: 'page-a',
			discordNickname: 'Page A'
		});
		const attendeeB = await createUser(standalone.prisma, {
			discordUserId: '4308',
			discordUsername: 'page-b',
			discordNickname: 'Page B'
		});
		const attendeeC = await createUser(standalone.prisma, {
			discordUserId: '4309',
			discordUsername: 'page-c',
			discordNickname: 'Page C'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-4306',
			name: 'Paged Review',
			state: EventSessionState.ENDED_PENDING_REVIEW,
			eventTierCode: MeritTypeCode.TIER_3,
			startedAt: new Date('2026-03-14T10:00:00.000Z'),
			endedAt: new Date('2026-03-14T11:00:00.000Z')
		});
		await standalone.prisma.eventParticipantStat.createMany({
			data: [
				{
					eventSessionId: eventSession.id,
					userId: attendeeA.id,
					attendedSeconds: 3600
				},
				{
					eventSessionId: eventSession.id,
					userId: attendeeB.id,
					attendedSeconds: 2700
				},
				{
					eventSessionId: eventSession.id,
					userId: attendeeC.id,
					attendedSeconds: 900
				}
			]
		});
		await standalone.prisma.eventReviewDecision.createMany({
			data: [
				{
					eventSessionId: eventSession.id,
					targetUserId: attendeeA.id,
					decision: EventReviewDecisionKind.MERIT
				},
				{
					eventSessionId: eventSession.id,
					targetUserId: attendeeC.id,
					decision: EventReviewDecisionKind.NO_MERIT
				}
			]
		});

		await expect(
			getEventReviewPage({
				eventSessionId: eventSession.id,
				page: 1,
				pageSize: 2
			})
		).resolves.toEqual({
			eventSession: {
				id: eventSession.id,
				name: 'Paged Review',
				state: EventSessionState.ENDED_PENDING_REVIEW,
				threadId: 'thread-4306',
				startedAt: new Date('2026-03-14T10:00:00.000Z'),
				endedAt: new Date('2026-03-14T11:00:00.000Z')
			},
			attendeeCount: 3,
			page: 1,
			pageSize: 2,
			totalPages: 2,
			attendees: [
				{
					dbUserId: attendeeA.id,
					discordUserId: attendeeA.discordUserId,
					discordUsername: attendeeA.discordUsername,
					discordNickname: attendeeA.discordNickname,
					attendedSeconds: 3600,
					decision: EventReviewDecisionKind.MERIT
				},
				{
					dbUserId: attendeeB.id,
					discordUserId: attendeeB.discordUserId,
					discordUsername: attendeeB.discordUsername,
					discordNickname: attendeeB.discordNickname,
					attendedSeconds: 2700,
					decision: null
				}
			]
		});
	});
});
