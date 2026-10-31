import { MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('merit summary query integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let meritRepository: typeof import('../../../src/integrations/prisma/repositories').meritRepository;
	let MeritTypeNotManualAwardableError: typeof import('../../../src/integrations/prisma/repositories').MeritTypeNotManualAwardableError;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ meritRepository, MeritTypeNotManualAwardableError } = await import('../../../src/integrations/prisma/repositories'));
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

	it('allows a successful eligibility lookup that exceeds the interactive transaction timeout', async () => {
		const recipient = await createUser(standalone.prisma, { discordUserId: 'slow-recipient' });
		const staff = await createUser(standalone.prisma, { discordUserId: 'slow-staff' });
		const result = await meritRepository.awardManualMerit({
			recipientDbUserId: recipient.id,
			awardedByDbUserId: staff.id,
			meritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			resolveMeritEligibility: async () => {
				await new Promise((resolve) => setTimeout(resolve, 6000));
				return 'eligible';
			}
		});
		expect(result.userId).toBe(recipient.id);
		expect(await standalone.prisma.merit.count()).toBe(1);
	}, 15000);

	it.each(['manual_type_disabled', 'recipient_changed'] as const)(
		'revalidates %s after the external lookup before committing a grant',
		async (change) => {
			const recipient = await createUser(standalone.prisma, { discordUserId: 'changed-recipient' });
			const staff = await createUser(standalone.prisma, { discordUserId: 'changed-staff' });
			await expect(
				meritRepository.awardManualMerit({
					recipientDbUserId: recipient.id,
					awardedByDbUserId: staff.id,
					meritTypeCode: MeritTypeCode.COMMANDER_MERIT,
					resolveMeritEligibility: async () => {
						if (change === 'manual_type_disabled')
							await standalone.prisma.meritType.update({
								where: { code: MeritTypeCode.COMMANDER_MERIT },
								data: { isManualAwardable: false }
							});
						else await standalone.prisma.user.update({ where: { id: recipient.id }, data: { discordUserId: 'replacement-recipient' } });
						return 'eligible';
					}
				})
			).rejects.toMatchObject({ name: change === 'manual_type_disabled' ? 'MeritTypeNotManualAwardableError' : 'MeritEligibilityError' });
			expect(await standalone.prisma.merit.count()).toBe(0);
		}
	);

	it.each(['not_org_member', 'unavailable'] as const)('blocks direct positive staff grants for %s but permits demerits', async (eligibility) => {
		const recipient = await createUser(standalone.prisma, { discordUserId: 'manual-recipient', discordUsername: 'recipient' });
		const staff = await createUser(standalone.prisma, { discordUserId: 'manual-staff', discordUsername: 'staff' });
		const resolveMeritEligibility = vi.fn().mockResolvedValue(eligibility);
		const params = { recipientDbUserId: recipient.id, awardedByDbUserId: staff.id, resolveMeritEligibility };
		await expect(meritRepository.awardManualMerit({ ...params, meritTypeCode: MeritTypeCode.COMMANDER_MERIT })).rejects.toMatchObject({
			name: 'MeritEligibilityError',
			eligibility
		});
		expect(await standalone.prisma.merit.count()).toBe(0);
		resolveMeritEligibility.mockClear();
		await meritRepository.awardManualMerit({ ...params, meritTypeCode: MeritTypeCode.DEMERIT });
		expect(resolveMeritEligibility).not.toHaveBeenCalled();
		expect(await standalone.prisma.merit.count()).toBe(1);
	});

	it('creates manual merits, rejects non-manual merit types, and summarizes totals across users', async () => {
		const awarder = await createUser(standalone.prisma, {
			discordUserId: '4401',
			discordUsername: 'awarder'
		});
		const recipient = await createUser(standalone.prisma, {
			discordUserId: '4402',
			discordUsername: 'recipient'
		});
		const otherRecipient = await createUser(standalone.prisma, {
			discordUserId: '4403',
			discordUsername: 'other-recipient'
		});
		const linkedEvent = await createEventSession(standalone.prisma, {
			hostUserId: awarder.id,
			threadId: 'thread-4401',
			name: 'Linked Merit Event',
			eventTierCode: MeritTypeCode.TIER_2
		});

		await expect(
			meritRepository.awardManualMerit({
				resolveMeritEligibility: async () => 'eligible',
				recipientDbUserId: recipient.id,
				awardedByDbUserId: awarder.id,
				meritTypeCode: MeritTypeCode.TIER_1
			})
		).rejects.toBeInstanceOf(MeritTypeNotManualAwardableError);

		const firstAward = await meritRepository.awardManualMerit({
			resolveMeritEligibility: async () => 'eligible',
			recipientDbUserId: recipient.id,
			awardedByDbUserId: awarder.id,
			meritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			reason: 'Leadership',
			eventSessionId: linkedEvent.id
		});
		const secondAward = await meritRepository.awardManualMerit({
			resolveMeritEligibility: async () => 'eligible',
			recipientDbUserId: recipient.id,
			awardedByDbUserId: awarder.id,
			meritTypeCode: MeritTypeCode.DEMERIT,
			reason: 'Penalty'
		});
		await meritRepository.awardManualMerit({
			resolveMeritEligibility: async () => 'eligible',
			recipientDbUserId: otherRecipient.id,
			awardedByDbUserId: awarder.id,
			meritTypeCode: MeritTypeCode.TESSERARIUS_MERIT,
			reason: 'Support'
		});

		await standalone.prisma.merit.update({
			where: {
				id: firstAward.id
			},
			data: {
				createdAt: new Date('2026-03-14T08:00:00.000Z')
			}
		});
		await standalone.prisma.merit.update({
			where: {
				id: secondAward.id
			},
			data: {
				createdAt: new Date('2026-03-14T09:00:00.000Z')
			}
		});

		await expect(
			meritRepository.getUserMeritSummary({
				userDbUserId: recipient.id,
				page: 1,
				pageSize: 1
			})
		).resolves.toEqual({
			totalMerits: 0,
			totalAwards: 2,
			totalLinkedEvents: 1,
			page: 1,
			pageSize: 1,
			totalPages: 2,
			entries: [
				{
					id: secondAward.id,
					amount: -1,
					meritTypeName: 'Demerit',
					awardedByName: 'awarder',
					reason: 'Penalty',
					createdAt: new Date('2026-03-14T09:00:00.000Z'),
					eventSession: null
				}
			]
		});

		await expect(
			meritRepository.getUserTotalMerits({
				userDbUserId: recipient.id
			})
		).resolves.toBe(0);
		await expect(
			meritRepository.getUsersTotalMerits({
				userDbUserIds: [recipient.id, otherRecipient.id, 'missing-user']
			})
		).resolves.toEqual(
			new Map([
				[recipient.id, 0],
				[otherRecipient.id, 4],
				['missing-user', 0]
			])
		);
	});
});
