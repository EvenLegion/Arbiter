import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

type MeritTypeSeed = {
	code: string;
	name: string;
	description: string;
	meritAmount: number;
};

const meritTypeSeeds: MeritTypeSeed[] = [
	{
		code: 'TIER_0',
		name: 'Tier 0',
		description: 'Casual Op',
		meritAmount: 0
	},
	{
		code: 'TIER_1',
		name: 'Tier 1',
		description: 'Experienced Op',
		meritAmount: 1
	},
	{
		code: 'TIER_2',
		name: 'Tier 2',
		description: 'Advanced Op',
		meritAmount: 2
	},
	{
		code: 'TIER_3',
		name: 'Tier 3',
		description: 'Elite Op',
		meritAmount: 3
	},
	{
		code: 'COMMANDER_MERIT',
		name: 'Commander Merit',
		description: 'Commander merit',
		meritAmount: 1
	},
	{
		code: 'TESSERARIUS_MERIT',
		name: 'Tesserarius Merit',
		description: 'Tesserarius merit',
		meritAmount: 4
	},
	{
		code: 'DEMERIT',
		name: 'Demerit',
		description: 'Demerit',
		meritAmount: -1
	}
];

export async function seedMeritTypes(prisma: PrismaClient) {
	for (const meritType of meritTypeSeeds) {
		await prisma.meritType.upsert({
			where: { code: meritType.code },
			update: {
				name: meritType.name,
				description: meritType.description,
				meritAmount: meritType.meritAmount
			},
			create: {
				code: meritType.code,
				name: meritType.name,
				description: meritType.description,
				meritAmount: meritType.meritAmount
			}
		});
	}
}
