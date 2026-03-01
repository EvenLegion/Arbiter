import { prisma } from '../prisma';

export async function findManyActiveEventTiers() {
	return prisma.eventTier.findMany({
		where: {
			isActive: true
		},
		orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }]
	});
}
