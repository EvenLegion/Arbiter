import { MeritTypeCode } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createDivision, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('merit rank breakdown integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let meritRepository: typeof import('../../../src/integrations/prisma/repositories').meritRepository;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ meritRepository } = await import('../../../src/integrations/prisma/repositories'));
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

	it('aggregates merit ranks across the requested division membership buckets', async () => {
		const awarder = await createUser(standalone.prisma, {
			discordUserId: '5100',
			discordUsername: 'awarder'
		});
		const levelOneUser = await createUser(standalone.prisma, {
			discordUserId: '5101',
			discordUsername: 'level-one'
		});
		const levelTwoUser = await createUser(standalone.prisma, {
			discordUserId: '5102',
			discordUsername: 'level-two'
		});
		const levelThreeCenturion = await createUser(standalone.prisma, {
			discordUserId: '5103',
			discordUsername: 'level-three-centurion'
		});
		const levelThreeLegionnaire = await createUser(standalone.prisma, {
			discordUserId: '5104',
			discordUsername: 'level-three-legionnaire'
		});
		await createUser(standalone.prisma, {
			discordUserId: '5105',
			discordUsername: 'unranked'
		});

		const lgnDivision = await createDivision(standalone.prisma, { code: 'LGN' });
		const resDivision = await createDivision(standalone.prisma, { code: 'RES' });
		const centDivision = await createDivision(standalone.prisma, { code: 'CENT', displayNamePrefix: null });
		const optDivision = await createDivision(standalone.prisma, { code: 'OPT', displayNamePrefix: null });
		const nvyDivision = await createDivision(standalone.prisma, { code: 'NVY' });
		const nvyLDivision = await createDivision(standalone.prisma, { code: 'NVY-L' });
		const mrnDivision = await createDivision(standalone.prisma, { code: 'MRN' });
		const mrnLDivision = await createDivision(standalone.prisma, { code: 'MRN-L' });
		const supDivision = await createDivision(standalone.prisma, { code: 'SUP' });
		const supLDivision = await createDivision(standalone.prisma, { code: 'SUP-L' });

		await standalone.prisma.divisionMembership.createMany({
			data: [
				{ userId: levelOneUser.id, divisionId: lgnDivision.id },
				{ userId: levelOneUser.id, divisionId: nvyDivision.id },
				{ userId: levelTwoUser.id, divisionId: resDivision.id },
				{ userId: levelTwoUser.id, divisionId: nvyLDivision.id },
				{ userId: levelThreeCenturion.id, divisionId: centDivision.id },
				{ userId: levelThreeCenturion.id, divisionId: optDivision.id },
				{ userId: levelThreeLegionnaire.id, divisionId: lgnDivision.id },
				{ userId: levelThreeLegionnaire.id, divisionId: resDivision.id },
				{ userId: levelThreeLegionnaire.id, divisionId: mrnDivision.id },
				{ userId: levelThreeLegionnaire.id, divisionId: mrnLDivision.id },
				{ userId: levelThreeLegionnaire.id, divisionId: supDivision.id },
				{ userId: levelThreeLegionnaire.id, divisionId: supLDivision.id }
			]
		});

		const meritTypeByCode = new Map(
			(
				await standalone.prisma.meritType.findMany({
					where: {
						code: {
							in: [MeritTypeCode.TIER_1, MeritTypeCode.TIER_3, MeritTypeCode.TESSERARIUS_MERIT]
						}
					}
				})
			).map((meritType) => [meritType.code, meritType.id])
		);

		await standalone.prisma.merit.createMany({
			data: [
				{
					userId: levelOneUser.id,
					awardedByUserId: awarder.id,
					meritTypeId: meritTypeByCode.get(MeritTypeCode.TIER_1)!
				},
				{
					userId: levelTwoUser.id,
					awardedByUserId: awarder.id,
					meritTypeId: meritTypeByCode.get(MeritTypeCode.TIER_3)!
				},
				{
					userId: levelThreeCenturion.id,
					awardedByUserId: awarder.id,
					meritTypeId: meritTypeByCode.get(MeritTypeCode.TESSERARIUS_MERIT)!
				},
				{
					userId: levelThreeCenturion.id,
					awardedByUserId: awarder.id,
					meritTypeId: meritTypeByCode.get(MeritTypeCode.TIER_3)!
				},
				{
					userId: levelThreeLegionnaire.id,
					awardedByUserId: awarder.id,
					meritTypeId: meritTypeByCode.get(MeritTypeCode.TESSERARIUS_MERIT)!
				},
				{
					userId: levelThreeLegionnaire.id,
					awardedByUserId: awarder.id,
					meritTypeId: meritTypeByCode.get(MeritTypeCode.TIER_3)!
				}
			]
		});

		const result = await meritRepository.getMeritRankBreakdown();

		expect(result.find((entry) => entry.level === 1)).toEqual({
			level: 1,
			lgnOrResCount: 1,
			lgnCount: 1,
			resCount: 0,
			centCount: 0,
			optCount: 0,
			nvyCount: 1,
			nvyLCount: 0,
			mrnCount: 0,
			mrnLCount: 0,
			supCount: 0,
			supLCount: 0
		});
		expect(result.find((entry) => entry.level === 2)).toEqual({
			level: 2,
			lgnOrResCount: 1,
			lgnCount: 0,
			resCount: 1,
			centCount: 0,
			optCount: 0,
			nvyCount: 0,
			nvyLCount: 1,
			mrnCount: 0,
			mrnLCount: 0,
			supCount: 0,
			supLCount: 0
		});
		expect(result.find((entry) => entry.level === 3)).toEqual({
			level: 3,
			lgnOrResCount: 1,
			lgnCount: 1,
			resCount: 1,
			centCount: 1,
			optCount: 1,
			nvyCount: 0,
			nvyLCount: 0,
			mrnCount: 1,
			mrnLCount: 1,
			supCount: 1,
			supLCount: 1
		});
		expect(result.find((entry) => entry.level === 4)).toEqual({
			level: 4,
			lgnOrResCount: 0,
			lgnCount: 0,
			resCount: 0,
			centCount: 0,
			optCount: 0,
			nvyCount: 0,
			nvyLCount: 0,
			mrnCount: 0,
			mrnLCount: 0,
			supCount: 0,
			supLCount: 0
		});
	});
});
