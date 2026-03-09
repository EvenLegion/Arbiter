import 'dotenv/config';

import { MeritTypeCode, PrismaClient } from '@prisma/client';

type MeritTypeSeed = {
	code: MeritTypeCode;
	name: string;
	description: string;
	meritAmount: number;
	isManualAwardable: boolean;
};

const meritTypeSeeds: MeritTypeSeed[] = [
	{
		code: MeritTypeCode.TIER_0,
		name: 'Tier 0',
		description: 'Casual Op',
		meritAmount: 0,
		isManualAwardable: false
	},
	{
		code: MeritTypeCode.TIER_1,
		name: 'Tier 1',
		description: 'Experienced Op',
		meritAmount: 1,
		isManualAwardable: false
	},
	{
		code: MeritTypeCode.TIER_2,
		name: 'Tier 2',
		description: 'Advanced Op',
		meritAmount: 2,
		isManualAwardable: false
	},
	{
		code: MeritTypeCode.TIER_3,
		name: 'Tier 3',
		description: 'Elite Op',
		meritAmount: 3,
		isManualAwardable: false
	},
	{
		code: MeritTypeCode.COMMANDER_MERIT,
		name: 'Commander Merit',
		description: 'Commander merit',
		meritAmount: 1,
		isManualAwardable: true
	},
	{
		code: MeritTypeCode.TESSERARIUS_MERIT,
		name: 'Tesserarius Merit',
		description: 'Tesserarius merit',
		meritAmount: 4,
		isManualAwardable: true
	},
	{
		code: MeritTypeCode.DEMERIT,
		name: 'Demerit',
		description: 'Demerit',
		meritAmount: -1,
		isManualAwardable: true
	}
];

export async function seedMeritTypes(prisma: PrismaClient) {
	for (const meritType of meritTypeSeeds) {
		await prisma.meritType.upsert({
			where: { code: meritType.code },
			update: {
				name: meritType.name,
				description: meritType.description,
				meritAmount: meritType.meritAmount,
				isManualAwardable: meritType.isManualAwardable
			},
			create: {
				code: meritType.code,
				name: meritType.name,
				description: meritType.description,
				meritAmount: meritType.meritAmount,
				isManualAwardable: meritType.isManualAwardable
			}
		});
	}
}
