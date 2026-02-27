import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

type EventTierSeed = {
  code: string;
  name: string;
  description: string;
  meritAmount: number;
  displayOrder: number;
};

const eventTierSeeds: EventTierSeed[] = [
  {
    code: 'TIER_1',
    name: 'Tier 1',
    description: 'Experienced Op',
    meritAmount: 1,
    displayOrder: 1,
  },
  {
    code: 'TIER_2',
    name: 'Tier 2',
    description: 'Advanced Op',
    meritAmount: 2,
    displayOrder: 2,
  },
  {
    code: 'TIER_3',
    name: 'Tier 3',
    description: 'Elite Op',
    meritAmount: 3,
    displayOrder: 3,
  },
];

export async function seedEventTiers(prisma: PrismaClient) {
  for (const tier of eventTierSeeds) {
    await prisma.eventTier.upsert({
      where: { code: tier.code },
      update: {
        name: tier.name,
        description: tier.description,
        meritAmount: tier.meritAmount,
        displayOrder: tier.displayOrder,
        isActive: true,
      },
      create: {
        code: tier.code,
        name: tier.name,
        description: tier.description,
        meritAmount: tier.meritAmount,
        displayOrder: tier.displayOrder,
        isActive: true,
      },
    });
  }
}
