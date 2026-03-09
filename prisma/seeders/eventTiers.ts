import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

type EventTierSeed = {
	code: string;
	name: string;
	description: string;
	meritTypeCode: string;
	displayOrder: number;
};

const eventTierSeeds: EventTierSeed[] = [
	{
		code: 'TIER_0',
		name: 'Tier 0',
		description: 'Casual Op',
		meritTypeCode: 'TIER_0',
		displayOrder: 0
	},
	{
		code: 'TIER_1',
		name: 'Tier 1',
		description: 'Experienced Op',
		meritTypeCode: 'TIER_1',
		displayOrder: 1
	},
	{
		code: 'TIER_2',
		name: 'Tier 2',
		description: 'Advanced Op',
		meritTypeCode: 'TIER_2',
		displayOrder: 2
	},
	{
		code: 'TIER_3',
		name: 'Tier 3',
		description: 'Elite Op',
		meritTypeCode: 'TIER_3',
		displayOrder: 3
	}
];

export async function seedEventTiers(prisma: PrismaClient) {
	for (const tier of eventTierSeeds) {
		await prisma.eventTier.upsert({
			where: { code: tier.code },
			update: {
				name: tier.name,
				description: tier.description,
				meritType: {
					connect: {
						code: tier.meritTypeCode
					}
				},
				displayOrder: tier.displayOrder
			},
			create: {
				code: tier.code,
				name: tier.name,
				description: tier.description,
				meritType: {
					connect: {
						code: tier.meritTypeCode
					}
				},
				displayOrder: tier.displayOrder
			}
		});
	}
}
