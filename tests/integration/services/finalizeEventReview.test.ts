import { EventReviewDecisionKind, EventSessionState, MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('finalizeEventReview integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let finalizeEventReview: typeof import('../../../src/integrations/prisma/event/finalizeEventReview').finalizeEventReview;
	let closeDb: typeof import('../../../src/integrations/prisma/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ finalizeEventReview } = await import('../../../src/integrations/prisma/event/finalizeEventReview'));
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

	it('finalizes an event with merits and writes merit rows for MERIT decisions only', async () => {
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '3001',
			discordUsername: 'reviewer'
		});
		const attendeeWithMerit = await createUser(standalone.prisma, {
			discordUserId: '3002',
			discordUsername: 'attendee-merit'
		});
		const attendeeWithoutMerit = await createUser(standalone.prisma, {
			discordUserId: '3003',
			discordUsername: 'attendee-no-merit'
		});
		const eventTier = await standalone.prisma.eventTier.findUniqueOrThrow({
			where: {
				code: MeritTypeCode.TIER_3
			}
		});
		const eventSession = await standalone.prisma.event.create({
			data: {
				hostUserId: reviewer.id,
				eventTierId: eventTier.id,
				threadId: 'thread-3001',
				name: 'Elite Op',
				state: EventSessionState.ENDED_PENDING_REVIEW,
				startedAt: new Date('2026-03-14T10:00:00.000Z'),
				endedAt: new Date('2026-03-14T11:00:00.000Z')
			}
		});
		await standalone.prisma.eventReviewDecision.createMany({
			data: [
				{
					eventSessionId: eventSession.id,
					targetUserId: attendeeWithMerit.id,
					decision: EventReviewDecisionKind.MERIT
				},
				{
					eventSessionId: eventSession.id,
					targetUserId: attendeeWithoutMerit.id,
					decision: EventReviewDecisionKind.NO_MERIT
				}
			]
		});

		const result = await finalizeEventReview({
			eventSessionId: eventSession.id,
			reviewerDbUserId: reviewer.id,
			mode: 'with'
		});

		expect(result).toMatchObject({
			finalized: true,
			toState: EventSessionState.FINALIZED_WITH_MERITS,
			awardedCount: 1,
			awardedMeritAmount: 3,
			awardedUsers: [
				{
					dbUserId: attendeeWithMerit.id,
					discordUserId: attendeeWithMerit.discordUserId
				}
			]
		});

		const persistedEvent = await standalone.prisma.event.findUniqueOrThrow({
			where: {
				id: eventSession.id
			}
		});
		expect(persistedEvent.state).toBe(EventSessionState.FINALIZED_WITH_MERITS);
		expect(persistedEvent.reviewFinalizedByUserId).toBe(reviewer.id);
		expect(persistedEvent.reviewFinalizedAt).toBeInstanceOf(Date);

		const merits = await standalone.prisma.merit.findMany({
			where: {
				eventSessionId: eventSession.id
			},
			orderBy: {
				id: 'asc'
			}
		});
		expect(merits).toHaveLength(1);
		expect(merits[0]).toMatchObject({
			userId: attendeeWithMerit.id,
			awardedByUserId: reviewer.id,
			reason: 'Awarded for attending'
		});
	});

	it('finalizes without merits and creates no merit rows', async () => {
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '3011',
			discordUsername: 'reviewer-two'
		});
		const eventTier = await standalone.prisma.eventTier.findUniqueOrThrow({
			where: {
				code: MeritTypeCode.TIER_1
			}
		});
		const eventSession = await standalone.prisma.event.create({
			data: {
				hostUserId: reviewer.id,
				eventTierId: eventTier.id,
				threadId: 'thread-3011',
				name: 'Training Op',
				state: EventSessionState.ENDED_PENDING_REVIEW
			}
		});

		const result = await finalizeEventReview({
			eventSessionId: eventSession.id,
			reviewerDbUserId: reviewer.id,
			mode: 'without'
		});

		expect(result).toMatchObject({
			finalized: true,
			toState: EventSessionState.FINALIZED_NO_MERITS,
			awardedCount: 0,
			awardedUsers: []
		});

		const merits = await standalone.prisma.merit.findMany({
			where: {
				eventSessionId: eventSession.id
			}
		});
		expect(merits).toHaveLength(0);
	});

	it('returns a no-op result when the event is not pending review', async () => {
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '3021',
			discordUsername: 'reviewer-three'
		});
		const eventTier = await standalone.prisma.eventTier.findUniqueOrThrow({
			where: {
				code: MeritTypeCode.TIER_2
			}
		});
		const eventSession = await standalone.prisma.event.create({
			data: {
				hostUserId: reviewer.id,
				eventTierId: eventTier.id,
				threadId: 'thread-3021',
				name: 'Already Active',
				state: EventSessionState.ACTIVE
			}
		});

		const result = await finalizeEventReview({
			eventSessionId: eventSession.id,
			reviewerDbUserId: reviewer.id,
			mode: 'with'
		});

		expect(result).toMatchObject({
			finalized: false,
			toState: EventSessionState.FINALIZED_WITH_MERITS,
			awardedCount: 0,
			awardedUsers: []
		});
	});
});

async function createUser(
	prisma: StandalonePrisma['prisma'],
	{ discordUserId, discordUsername }: { discordUserId: string; discordUsername: string }
) {
	return prisma.user.create({
		data: {
			discordUserId,
			discordUsername,
			discordNickname: discordUsername,
			discordAvatarUrl: `https://example.com/${discordUserId}.png`
		}
	});
}
