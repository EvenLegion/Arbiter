import { MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { awardManualMeritWorkflow, type ResolvedManualMeritMember } from '../../../src/lib/services/manual-merit/manualMeritService';
import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('manualMeritService integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let eventRepository: typeof import('../../../src/integrations/prisma/repositories').eventRepository;
	let meritRepository: typeof import('../../../src/integrations/prisma/repositories').meritRepository;
	let userRepository: typeof import('../../../src/integrations/prisma/repositories').userRepository;
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
		({ eventRepository, meritRepository, userRepository } = await import('../../../src/integrations/prisma/repositories'));
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

	it('awards a manual merit through the service and persists the merit row', async () => {
		const host = await createUser(standalone.prisma, {
			discordUserId: '5301',
			discordUsername: 'host'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: host.id,
			threadId: 'thread-5301',
			name: 'Merit Linked Event',
			eventTierCode: MeritTypeCode.TIER_1
		});

		const result = await awardManualMeritWorkflow(
			{
				resolveTargetMember: async (playerInput) => (playerInput === '5302' ? buildResolvedMember('5302') : null),
				upsertUser: userRepository.upsert,
				findLinkedEvent: async (eventSessionId) => {
					const event = await eventRepository.getSession({
						eventSessionId
					});
					if (!event) {
						return null;
					}

					return {
						id: event.id,
						name: event.name,
						createdAt: event.createdAt
					};
				},
				awardManualMerit: meritRepository.awardManualMerit,
				syncRecipientNickname: async () => 'ok',
				computeAwarderNickname: async () => 'Staff Display',
				getRecipientTotalMerits: meritRepository.getUserTotalMerits,
				notifyRankUp: vi.fn().mockResolvedValue(undefined),
				sendRecipientDm: vi.fn().mockResolvedValue(true)
			},
			{
				actor: {
					discordUserId: '5303',
					dbUserId: 'staff-db-user',
					capabilities: {
						isStaff: true,
						isCenturion: false
					}
				},
				actorMember: buildResolvedMember('5303'),
				playerInput: '5302',
				rawMeritTypeCode: MeritTypeCode.COMMANDER_MERIT,
				reason: 'Exceptional leadership',
				linkedEventSessionId: eventSession.id
			}
		);

		expect(result).toEqual({
			kind: 'awarded',
			meritRecordId: 1,
			targetDiscordUserId: '5302',
			meritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			meritTypeName: 'Commander Merit',
			meritAmount: 1,
			linkedEventName: eventSession.name,
			reason: 'Exceptional leadership',
			dmSent: true,
			recipientNicknameTooLong: false
		});
		await expect(
			standalone.prisma.merit.findMany({
				where: {
					eventSessionId: eventSession.id
				}
			})
		).resolves.toEqual([
			expect.objectContaining({
				reason: 'Exceptional leadership',
				eventSessionId: eventSession.id
			})
		]);
	});

	it('returns linked_event_not_found when the linked event cannot be loaded', async () => {
		const result = await awardManualMeritWorkflow(
			{
				resolveTargetMember: async () => buildResolvedMember('5304'),
				upsertUser: userRepository.upsert,
				findLinkedEvent: async () => null,
				awardManualMerit: meritRepository.awardManualMerit,
				syncRecipientNickname: async () => 'ok',
				computeAwarderNickname: async () => 'Staff Display',
				getRecipientTotalMerits: meritRepository.getUserTotalMerits,
				notifyRankUp: vi.fn().mockResolvedValue(undefined),
				sendRecipientDm: vi.fn().mockResolvedValue(true)
			},
			{
				actor: {
					discordUserId: '5305',
					dbUserId: 'staff-db-user',
					capabilities: {
						isStaff: true,
						isCenturion: false
					}
				},
				actorMember: buildResolvedMember('5305'),
				playerInput: '5304',
				rawMeritTypeCode: MeritTypeCode.COMMANDER_MERIT,
				reason: null,
				linkedEventSessionId: 999
			}
		);

		expect(result).toEqual({
			kind: 'linked_event_not_found'
		});
		await expect(standalone.prisma.merit.count()).resolves.toBe(0);
	});
});

function buildResolvedMember(discordUserId: string): ResolvedManualMeritMember {
	return {
		discordUserId,
		discordUsername: `user-${discordUserId}`,
		discordDisplayName: `Display ${discordUserId}`,
		discordGlobalName: `Global ${discordUserId}`,
		discordAvatarUrl: `https://example.com/${discordUserId}.png`,
		isBot: false
	};
}
