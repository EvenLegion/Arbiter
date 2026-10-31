import { EventReviewDecisionKind, EventSessionState, MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('finalizeEventReview integration', () => {
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
		({ eventReviewRepository } = await import('../../../src/integrations/prisma/repositories'));
		({ closeDb } = await import('../../../src/integrations/prisma'));
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

	it('checks the automatic host award when there are no attendee merit decisions', async () => {
		const host = await createUser(standalone.prisma, { discordUserId: 'only-host', discordUsername: 'host' });
		const tier = await standalone.prisma.eventTier.findUniqueOrThrow({ where: { code: MeritTypeCode.TIER_1 } });
		const event = await standalone.prisma.event.create({
			data: {
				hostUserId: host.id,
				eventTierId: tier.id,
				threadId: 'only-host-thread',
				name: 'Host only',
				state: EventSessionState.ENDED_PENDING_REVIEW
			}
		});
		expect(
			await eventReviewRepository.finalizeReview({
				eventSessionId: event.id,
				reviewerDbUserId: host.id,
				mode: 'with',
				resolveMeritEligibility: async () => 'not_org_member'
			})
		).toMatchObject({ finalized: true, awardedCount: 0, awardedUsers: [] });
		expect(await standalone.prisma.merit.count()).toBe(0);
	});

	it('rolls back finalization when another attendee is selected during live eligibility checks', async () => {
		const host = await createUser(standalone.prisma, { discordUserId: 'concurrent-host', discordUsername: 'host' });
		const attendee = await createUser(standalone.prisma, { discordUserId: 'concurrent-attendee', discordUsername: 'attendee' });
		const tier = await standalone.prisma.eventTier.findUniqueOrThrow({ where: { code: MeritTypeCode.TIER_1 } });
		const event = await standalone.prisma.event.create({
			data: {
				hostUserId: host.id,
				eventTierId: tier.id,
				threadId: 'concurrent-thread',
				name: 'Concurrent review',
				state: EventSessionState.ENDED_PENDING_REVIEW
			}
		});
		await expect(
			eventReviewRepository.finalizeReview({
				eventSessionId: event.id,
				reviewerDbUserId: host.id,
				mode: 'with',
				resolveMeritEligibility: async () => {
					await standalone.prisma.eventReviewDecision.create({
						data: { eventSessionId: event.id, targetUserId: attendee.id, decision: EventReviewDecisionKind.MERIT }
					});
					return 'eligible';
				}
			})
		).rejects.toMatchObject({ name: 'MeritEligibilityError' });
		expect(await standalone.prisma.merit.count()).toBe(0);
		expect(await standalone.prisma.event.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({
			state: EventSessionState.ENDED_PENDING_REVIEW,
			reviewFinalizedAt: null
		});
	});

	it.each(['attendee', 'host', 'both'] as const)(
		'rechecks and excludes %s after org role removal, keeping attendance and retry safety',
		async (removed) => {
			const host = await createUser(standalone.prisma, { discordUserId: 'removed-host', discordUsername: 'host' });
			const attendee = await createUser(standalone.prisma, { discordUserId: 'removed-attendee', discordUsername: 'attendee' });
			const tier = await standalone.prisma.eventTier.findUniqueOrThrow({ where: { code: MeritTypeCode.TIER_3 } });
			const event = await standalone.prisma.event.create({
				data: {
					hostUserId: host.id,
					eventTierId: tier.id,
					threadId: 'removed-thread',
					name: 'Role removal',
					state: EventSessionState.ENDED_PENDING_REVIEW
				}
			});
			await standalone.prisma.eventParticipantStat.create({ data: { eventSessionId: event.id, userId: attendee.id, attendedSeconds: 3600 } });
			await standalone.prisma.eventReviewDecision.create({
				data: { eventSessionId: event.id, targetUserId: attendee.id, decision: EventReviewDecisionKind.MERIT }
			});
			const resolveMeritEligibility = vi.fn(
				async (id: string) =>
					(removed === 'both' || id === `removed-${removed}` ? 'not_org_member' : 'eligible') as 'not_org_member' | 'eligible'
			);
			const input = { eventSessionId: event.id, reviewerDbUserId: host.id, mode: 'with' as const, resolveMeritEligibility };
			const result = await eventReviewRepository.finalizeReview(input);
			expect(result.awardedCount).toBe(removed === 'both' ? 0 : 1);
			expect(result.awardedUsers.map((u) => u.discordUserId)).toEqual(
				removed === 'both' ? [] : [removed === 'host' ? attendee.discordUserId : host.discordUserId]
			);
			expect(await standalone.prisma.merit.count({ where: { eventSessionId: event.id } })).toBe(result.awardedCount);
			expect(await standalone.prisma.eventParticipantStat.findMany({ where: { eventSessionId: event.id } })).toMatchObject([
				{ userId: attendee.id, attendedSeconds: 3600 }
			]);
			if (removed !== 'host')
				expect(await standalone.prisma.eventReviewDecision.findMany({ where: { eventSessionId: event.id } })).toMatchObject([
					{ decision: 'NO_MERIT' }
				]);
			expect(await eventReviewRepository.finalizeReview(input)).toMatchObject({ finalized: false, awardedCount: 0 });
		}
	);

	it.each(['host', 'attendee'] as const)('keeps review pending with no awards when %s eligibility is unavailable', async (failed) => {
		const host = await createUser(standalone.prisma, { discordUserId: 'unknown-host', discordUsername: 'host' });
		const attendee = await createUser(standalone.prisma, { discordUserId: 'unknown-attendee', discordUsername: 'attendee' });
		const tier = await standalone.prisma.eventTier.findUniqueOrThrow({ where: { code: MeritTypeCode.TIER_1 } });
		const event = await standalone.prisma.event.create({
			data: {
				hostUserId: host.id,
				eventTierId: tier.id,
				threadId: 'unknown-thread',
				name: 'Lookup failure',
				state: EventSessionState.ENDED_PENDING_REVIEW
			}
		});
		await standalone.prisma.eventReviewDecision.create({
			data: { eventSessionId: event.id, targetUserId: attendee.id, decision: EventReviewDecisionKind.MERIT }
		});
		await expect(
			eventReviewRepository.finalizeReview({
				eventSessionId: event.id,
				reviewerDbUserId: host.id,
				mode: 'with',
				resolveMeritEligibility: async (id) => (id === `unknown-${failed}` ? 'unavailable' : 'eligible')
			})
		).rejects.toMatchObject({ name: 'MeritEligibilityError' });
		expect(await standalone.prisma.merit.count()).toBe(0);
		expect(await standalone.prisma.event.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({
			state: EventSessionState.ENDED_PENDING_REVIEW,
			reviewFinalizedAt: null
		});
		expect(
			await eventReviewRepository.finalizeReview({
				eventSessionId: event.id,
				reviewerDbUserId: host.id,
				mode: 'with',
				resolveMeritEligibility: async () => 'eligible'
			})
		).toMatchObject({ finalized: true, awardedCount: 2 });
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

		const result = await eventReviewRepository.finalizeReview({
			resolveMeritEligibility: async () => 'eligible',
			eventSessionId: eventSession.id,
			reviewerDbUserId: reviewer.id,
			mode: 'with'
		});

		expect(result).toMatchObject({
			finalized: true,
			toState: EventSessionState.FINALIZED_WITH_MERITS,
			awardedCount: 2,
			awardedUsers: [
				{
					dbUserId: attendeeWithMerit.id,
					discordUserId: attendeeWithMerit.discordUserId,
					awardedMeritAmount: 3
				},
				{
					dbUserId: reviewer.id,
					discordUserId: reviewer.discordUserId,
					awardedMeritAmount: 2
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
		expect(merits).toHaveLength(2);
		expect(merits[0]).toMatchObject({
			userId: attendeeWithMerit.id,
			awardedByUserId: reviewer.id,
			reason: 'Awarded for attending'
		});
		expect(merits[1]).toMatchObject({
			userId: reviewer.id,
			awardedByUserId: reviewer.id,
			reason: 'Awarded for hosting'
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

		const result = await eventReviewRepository.finalizeReview({
			resolveMeritEligibility: async () => 'eligible',
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

		const result = await eventReviewRepository.finalizeReview({
			resolveMeritEligibility: async () => 'eligible',
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
