import { DivisionKind, EventReviewDecisionKind, EventSessionState, MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createDivision, createEventSession, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('user migration repository integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let userMigrationRepository: typeof import('../../../src/integrations/prisma/repositories').userMigrationRepository;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ userMigrationRepository } = await import('../../../src/integrations/prisma/repositories'));
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

	it('migrates and merges overlapping user-linked records into the new account', async () => {
		const oldUser = await createUser(standalone.prisma, {
			discordUserId: '8001',
			discordUsername: 'old-user',
			discordNickname: 'LegacyNick'
		});
		const newUser = await createUser(standalone.prisma, {
			discordUserId: '8002',
			discordUsername: 'new-user',
			discordNickname: 'CurrentNick'
		});
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '8003',
			discordUsername: 'reviewer'
		});
		const intDivision = await createDivision(standalone.prisma, {
			code: 'INT',
			name: 'Initiate',
			kind: DivisionKind.INITIATE
		});
		const resDivision = await createDivision(standalone.prisma, {
			code: 'RES',
			name: 'Reserve',
			kind: DivisionKind.RESERVE
		});

		await standalone.prisma.divisionMembership.createMany({
			data: [
				{
					userId: oldUser.id,
					divisionId: intDivision.id
				},
				{
					userId: oldUser.id,
					divisionId: resDivision.id
				},
				{
					userId: newUser.id,
					divisionId: intDivision.id
				}
			]
		});

		await standalone.prisma.nameChangeRequest.createMany({
			data: [
				{
					requesterUserId: oldUser.id,
					currentName: 'LegacyNick',
					requestedName: 'LegacyNick2',
					reason: 'req'
				},
				{
					requesterUserId: reviewer.id,
					currentName: 'A',
					requestedName: 'B',
					reason: 'rev',
					reviewerUserId: oldUser.id,
					reviewedAt: new Date()
				}
			]
		});

		const overlapStatEvent = await createEventSession(standalone.prisma, {
			hostUserId: reviewer.id,
			threadId: 'thread-8001-overlap',
			name: 'Overlap Stat',
			state: EventSessionState.FINALIZED_WITH_MERITS,
			eventTierCode: MeritTypeCode.TIER_1
		});
		const oldOnlyStatEvent = await createEventSession(standalone.prisma, {
			hostUserId: reviewer.id,
			threadId: 'thread-8001-old-only',
			name: 'Old Only Stat',
			state: EventSessionState.FINALIZED_WITH_MERITS,
			eventTierCode: MeritTypeCode.TIER_1
		});
		const overlapDecisionEvent = await createEventSession(standalone.prisma, {
			hostUserId: reviewer.id,
			threadId: 'thread-8001-decision-overlap',
			name: 'Overlap Decision',
			state: EventSessionState.ENDED_PENDING_REVIEW,
			eventTierCode: MeritTypeCode.TIER_1
		});
		const oldOnlyDecisionEvent = await createEventSession(standalone.prisma, {
			hostUserId: reviewer.id,
			threadId: 'thread-8001-decision-old-only',
			name: 'Old Only Decision',
			state: EventSessionState.ENDED_PENDING_REVIEW,
			eventTierCode: MeritTypeCode.TIER_1
		});
		const hostedEvent = await createEventSession(standalone.prisma, {
			hostUserId: oldUser.id,
			threadId: 'thread-8001-hosted',
			name: 'Hosted By Old',
			state: EventSessionState.ACTIVE,
			eventTierCode: MeritTypeCode.TIER_1
		});
		const finalizedEvent = await createEventSession(standalone.prisma, {
			hostUserId: reviewer.id,
			threadId: 'thread-8001-finalized',
			name: 'Finalized By Old',
			state: EventSessionState.FINALIZED_WITH_MERITS,
			eventTierCode: MeritTypeCode.TIER_1,
			reviewFinalizedByUserId: oldUser.id
		});

		await standalone.prisma.eventChannel.create({
			data: {
				eventSessionId: hostedEvent.id,
				channelId: 'channel-8001',
				kind: 'PARENT_VC',
				addedByUserId: oldUser.id
			}
		});

		await standalone.prisma.eventParticipantStat.createMany({
			data: [
				{
					eventSessionId: overlapStatEvent.id,
					userId: oldUser.id,
					attendedSeconds: 100
				},
				{
					eventSessionId: overlapStatEvent.id,
					userId: newUser.id,
					attendedSeconds: 50
				},
				{
					eventSessionId: oldOnlyStatEvent.id,
					userId: oldUser.id,
					attendedSeconds: 80
				}
			]
		});

		await standalone.prisma.eventReviewDecision.createMany({
			data: [
				{
					eventSessionId: overlapDecisionEvent.id,
					targetUserId: oldUser.id,
					decision: EventReviewDecisionKind.MERIT
				},
				{
					eventSessionId: overlapDecisionEvent.id,
					targetUserId: newUser.id,
					decision: EventReviewDecisionKind.NO_MERIT
				},
				{
					eventSessionId: oldOnlyDecisionEvent.id,
					targetUserId: oldUser.id,
					decision: EventReviewDecisionKind.NO_MERIT
				}
			]
		});

		const tierMeritType = await standalone.prisma.meritType.findUniqueOrThrow({
			where: {
				code: MeritTypeCode.TIER_1
			}
		});
		await standalone.prisma.merit.createMany({
			data: [
				{
					userId: oldUser.id,
					awardedByUserId: reviewer.id,
					meritTypeId: tierMeritType.id
				},
				{
					userId: reviewer.id,
					awardedByUserId: oldUser.id,
					meritTypeId: tierMeritType.id
				}
			]
		});

		const result = await userMigrationRepository.migrateByDiscordUserId({
			oldDiscordUserId: oldUser.discordUserId,
			newDiscordUserId: newUser.discordUserId
		});

		expect(result).toMatchObject({
			kind: 'migrated',
			counts: expect.objectContaining({
				baseNicknameCopied: true,
				divisionMembershipsReassigned: 1,
				divisionMembershipsMerged: 1,
				participantStatsReassigned: 1,
				participantStatsMerged: 1,
				reviewDecisionsReassigned: 1,
				reviewDecisionsMerged: 1
			})
		});

		await expect(
			standalone.prisma.user.findUniqueOrThrow({
				where: {
					id: newUser.id
				}
			})
		).resolves.toMatchObject({
			discordNickname: 'LegacyNick'
		});

		await expect(
			standalone.prisma.divisionMembership.findMany({
				where: {
					userId: oldUser.id
				}
			})
		).resolves.toEqual([]);

		await expect(
			standalone.prisma.divisionMembership.findMany({
				where: {
					userId: newUser.id
				},
				orderBy: {
					divisionId: 'asc'
				}
			})
		).resolves.toHaveLength(2);

		await expect(
			standalone.prisma.eventParticipantStat.findMany({
				where: {
					eventSessionId: overlapStatEvent.id
				}
			})
		).resolves.toEqual([
			expect.objectContaining({
				userId: newUser.id,
				attendedSeconds: 100
			})
		]);

		await expect(
			standalone.prisma.eventParticipantStat.findUniqueOrThrow({
				where: {
					eventSessionId_userId: {
						eventSessionId: oldOnlyStatEvent.id,
						userId: newUser.id
					}
				}
			})
		).resolves.toMatchObject({
			attendedSeconds: 80
		});

		await expect(
			standalone.prisma.eventReviewDecision.findMany({
				where: {
					eventSessionId: overlapDecisionEvent.id
				}
			})
		).resolves.toEqual([
			expect.objectContaining({
				targetUserId: newUser.id,
				decision: EventReviewDecisionKind.MERIT
			})
		]);

		await expect(
			standalone.prisma.eventReviewDecision.findUniqueOrThrow({
				where: {
					eventSessionId_targetUserId: {
						eventSessionId: oldOnlyDecisionEvent.id,
						targetUserId: newUser.id
					}
				}
			})
		).resolves.toMatchObject({
			decision: EventReviewDecisionKind.NO_MERIT
		});

		await expect(
			standalone.prisma.merit.count({
				where: {
					userId: oldUser.id
				}
			})
		).resolves.toBe(0);
		await expect(
			standalone.prisma.merit.count({
				where: {
					awardedByUserId: oldUser.id
				}
			})
		).resolves.toBe(0);
		await expect(
			standalone.prisma.merit.count({
				where: {
					userId: newUser.id
				}
			})
		).resolves.toBe(1);
		await expect(
			standalone.prisma.merit.count({
				where: {
					awardedByUserId: newUser.id
				}
			})
		).resolves.toBe(1);

		await expect(
			standalone.prisma.event.findUniqueOrThrow({
				where: {
					id: hostedEvent.id
				}
			})
		).resolves.toMatchObject({
			hostUserId: newUser.id
		});
		await expect(
			standalone.prisma.event.findUniqueOrThrow({
				where: {
					id: finalizedEvent.id
				}
			})
		).resolves.toMatchObject({
			reviewFinalizedByUserId: newUser.id
		});
		await expect(
			standalone.prisma.eventChannel.findFirstOrThrow({
				where: {
					eventSessionId: hostedEvent.id
				}
			})
		).resolves.toMatchObject({
			addedByUserId: newUser.id
		});
	});

	it('blocks purge while references remain and deletes the user after migration clears them', async () => {
		const oldUser = await createUser(standalone.prisma, {
			discordUserId: '8101',
			discordUsername: 'old-user'
		});
		const newUser = await createUser(standalone.prisma, {
			discordUserId: '8102',
			discordUsername: 'new-user'
		});
		const meritType = await standalone.prisma.meritType.findUniqueOrThrow({
			where: {
				code: MeritTypeCode.TIER_1
			}
		});
		await standalone.prisma.merit.create({
			data: {
				userId: oldUser.id,
				awardedByUserId: newUser.id,
				meritTypeId: meritType.id
			}
		});

		await expect(
			userMigrationRepository.purgeByDiscordUserId({
				discordUserId: oldUser.discordUserId
			})
		).resolves.toMatchObject({
			kind: 'references_remaining',
			referenceCounts: expect.objectContaining({
				meritsReceived: 1
			})
		});

		await userMigrationRepository.migrateByDiscordUserId({
			oldDiscordUserId: oldUser.discordUserId,
			newDiscordUserId: newUser.discordUserId
		});

		await expect(
			userMigrationRepository.purgeByDiscordUserId({
				discordUserId: oldUser.discordUserId
			})
		).resolves.toMatchObject({
			kind: 'purged',
			user: expect.objectContaining({
				discordUserId: oldUser.discordUserId
			})
		});

		await expect(
			standalone.prisma.user.findUnique({
				where: {
					id: oldUser.id
				}
			})
		).resolves.toBeNull();
	});
});
