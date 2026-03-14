import { MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('merit summary query integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let awardManualMerit: typeof import('../../../src/integrations/prisma/awardManualMerit').awardManualMerit;
	let MeritTypeNotManualAwardableError: typeof import('../../../src/integrations/prisma/awardManualMerit').MeritTypeNotManualAwardableError;
	let getUserMeritSummary: typeof import('../../../src/integrations/prisma/getUserMeritSummary').getUserMeritSummary;
	let getUserTotalMerits: typeof import('../../../src/integrations/prisma/getUserTotalMerits').getUserTotalMerits;
	let getUsersTotalMerits: typeof import('../../../src/integrations/prisma/getUsersTotalMerits').getUsersTotalMerits;
	let closeDb: typeof import('../../../src/integrations/prisma/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ awardManualMerit, MeritTypeNotManualAwardableError } = await import('../../../src/integrations/prisma/awardManualMerit'));
		({ getUserMeritSummary } = await import('../../../src/integrations/prisma/getUserMeritSummary'));
		({ getUserTotalMerits } = await import('../../../src/integrations/prisma/getUserTotalMerits'));
		({ getUsersTotalMerits } = await import('../../../src/integrations/prisma/getUsersTotalMerits'));
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
			awardManualMerit({
				recipientDbUserId: recipient.id,
				awardedByDbUserId: awarder.id,
				meritTypeCode: MeritTypeCode.TIER_1
			})
		).rejects.toBeInstanceOf(MeritTypeNotManualAwardableError);

		const firstAward = await awardManualMerit({
			recipientDbUserId: recipient.id,
			awardedByDbUserId: awarder.id,
			meritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			reason: 'Leadership',
			eventSessionId: linkedEvent.id
		});
		const secondAward = await awardManualMerit({
			recipientDbUserId: recipient.id,
			awardedByDbUserId: awarder.id,
			meritTypeCode: MeritTypeCode.DEMERIT,
			reason: 'Penalty'
		});
		await awardManualMerit({
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
			getUserMeritSummary({
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
					reason: 'Penalty',
					createdAt: new Date('2026-03-14T09:00:00.000Z'),
					eventSession: null
				}
			]
		});

		await expect(
			getUserTotalMerits({
				userDbUserId: recipient.id
			})
		).resolves.toBe(0);
		await expect(
			getUsersTotalMerits({
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
