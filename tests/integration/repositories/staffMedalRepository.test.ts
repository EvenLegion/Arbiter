import { EventReviewDecisionKind, EventSessionState, MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('staff medal repository integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let staffMedalRepository: typeof import('../../../src/integrations/prisma/repositories').staffMedalRepository;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ staffMedalRepository } = await import('../../../src/integrations/prisma/repositories'));
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

	it('returns only attendees marked MERIT in the review and ignores linked host merits', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '5101',
			discordUsername: 'host-user',
			discordNickname: 'Host User'
		});
		const meritAttendee = await createUser(standalone.prisma, {
			discordUserId: '5102',
			discordUsername: 'merit-attendee',
			discordNickname: 'Merit Attendee'
		});
		const noMeritAttendee = await createUser(standalone.prisma, {
			discordUserId: '5103',
			discordUsername: 'no-merit-attendee',
			discordNickname: 'No Merit Attendee'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-5101',
			name: 'Medal Review Event',
			state: EventSessionState.FINALIZED_WITH_MERITS,
			eventTierCode: MeritTypeCode.TIER_1
		});
		const hostMeritType = await standalone.prisma.meritType.findUniqueOrThrow({
			where: {
				code: MeritTypeCode.CENTURION_HOST_MERIT
			}
		});

		await standalone.prisma.eventParticipantStat.createMany({
			data: [
				{
					eventSessionId: eventSession.id,
					userId: hostUser.id,
					attendedSeconds: 3600
				},
				{
					eventSessionId: eventSession.id,
					userId: meritAttendee.id,
					attendedSeconds: 3500
				},
				{
					eventSessionId: eventSession.id,
					userId: noMeritAttendee.id,
					attendedSeconds: 3400
				}
			]
		});

		await standalone.prisma.eventReviewDecision.createMany({
			data: [
				{
					eventSessionId: eventSession.id,
					targetUserId: meritAttendee.id,
					decision: EventReviewDecisionKind.MERIT
				},
				{
					eventSessionId: eventSession.id,
					targetUserId: noMeritAttendee.id,
					decision: EventReviewDecisionKind.NO_MERIT
				}
			]
		});

		await standalone.prisma.merit.create({
			data: {
				userId: hostUser.id,
				awardedByUserId: hostUser.id,
				meritTypeId: hostMeritType.id,
				eventSessionId: eventSession.id
			}
		});

		await expect(
			staffMedalRepository.listEventMeritRecipients({
				eventSessionId: eventSession.id
			})
		).resolves.toEqual([
			expect.objectContaining({
				userId: meritAttendee.id,
				user: expect.objectContaining({
					discordUserId: meritAttendee.discordUserId
				})
			})
		]);
	});
});
