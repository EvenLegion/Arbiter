import { EventReviewDecisionKind, EventSessionState, MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('event Prisma query families', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;
	let findManyEventSessions: typeof import('../../../src/integrations/prisma/event/session').findManyEventSessions;
	let getEventReviewPage: typeof import('../../../src/integrations/prisma/event/review').getEventReviewPage;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ closeDb } = await import('../../../src/integrations/prisma'));
		({ findManyEventSessions } = await import('../../../src/integrations/prisma/event/session'));
		({ getEventReviewPage } = await import('../../../src/integrations/prisma/event/review'));
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

	it('filters event sessions by state and fuzzy query through the session family', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '7001',
			discordUsername: 'host-7001'
		});
		await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-7001',
			name: 'Friday Naval Op',
			state: EventSessionState.DRAFT,
			eventTierCode: MeritTypeCode.TIER_1
		});
		await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-7002',
			name: 'Saturday Armor Drill',
			state: EventSessionState.ACTIVE,
			eventTierCode: MeritTypeCode.TIER_2
		});

		await expect(
			findManyEventSessions({
				states: [EventSessionState.DRAFT],
				query: 'naval'
			})
		).resolves.toEqual([
			expect.objectContaining({
				name: 'Friday Naval Op',
				state: EventSessionState.DRAFT
			})
		]);
	});

	it('returns ordered review attendees with persisted decisions through the review family', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '7003',
			discordUsername: 'host-7003'
		});
		const attendeeA = await createUser(standalone.prisma, {
			discordUserId: '7004',
			discordUsername: 'attendee-a',
			discordNickname: 'Attendee A'
		});
		const attendeeB = await createUser(standalone.prisma, {
			discordUserId: '7005',
			discordUsername: 'attendee-b',
			discordNickname: 'Attendee B'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-7003',
			name: 'Review Family Event',
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
					attendedSeconds: 1200
				}
			]
		});
		await standalone.prisma.eventReviewDecision.create({
			data: {
				eventSessionId: eventSession.id,
				targetUserId: attendeeA.id,
				decision: EventReviewDecisionKind.MERIT
			}
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
				name: 'Review Family Event',
				state: EventSessionState.ENDED_PENDING_REVIEW,
				threadId: 'thread-7003',
				startedAt: new Date('2026-03-14T10:00:00.000Z'),
				endedAt: new Date('2026-03-14T11:00:00.000Z')
			},
			attendeeCount: 2,
			page: 1,
			pageSize: 2,
			totalPages: 1,
			attendees: [
				{
					dbUserId: attendeeA.id,
					discordUserId: '7004',
					discordUsername: 'attendee-a',
					discordNickname: 'Attendee A',
					attendedSeconds: 3600,
					decision: EventReviewDecisionKind.MERIT
				},
				{
					dbUserId: attendeeB.id,
					discordUserId: '7005',
					discordUsername: 'attendee-b',
					discordNickname: 'Attendee B',
					attendedSeconds: 1200,
					decision: null
				}
			]
		});
	});
});
