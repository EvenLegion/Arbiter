import { prisma } from '../prisma';

type FindUniqueActiveEventTierByIdParams = {
	eventTierId: number;
};

export async function findUniqueActiveEventTierById({ eventTierId }: FindUniqueActiveEventTierByIdParams) {
	return prisma.eventTier.findFirst({
		where: {
			id: eventTierId,
			isActive: true
		}
	});
}
