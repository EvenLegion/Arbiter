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
				recipientDbUserId: recipient.id,
				awardedByDbUserId: awarder.id,
				meritTypeCode: MeritTypeCode.TIER_1
			})
		).rejects.toBeInstanceOf(MeritTypeNotManualAwardableError);

		const firstAward = await meritRepository.awardManualMerit({
			recipientDbUserId: recipient.id,
			awardedByDbUserId: awarder.id,
			meritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			reason: 'Leadership',
			eventSessionId: linkedEvent.id
		});
		const secondAward = await meritRepository.awardManualMerit({
			recipientDbUserId: recipient.id,
			awardedByDbUserId: awarder.id,
			meritTypeCode: MeritTypeCode.DEMERIT,
			reason: 'Penalty'
		});
		await meritRepository.awardManualMerit({
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
