import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

type EventTierFilters = {
	eventTierIds?: number[];
	eventTierId?: number;
	isActive?: boolean;
	query?: string;
	where?: Prisma.EventTierWhereInput;
};

type FindManyEventTiersParams = EventTierFilters & {
	orderBy?: Prisma.EventTierOrderByWithRelationInput[];
	limit?: number;
};

export async function findManyEventTiers({ eventTierIds, eventTierId, isActive, query = '', where, orderBy, limit }: FindManyEventTiersParams = {}) {
	if (eventTierIds && eventTierIds.length === 0) {
		return [];
	}

	const derivedWhere = buildEventTierWhere({
		eventTierIds,
		eventTierId,
		isActive,
		query
	});
	const combinedWhere = combineWhereConditions({
		derivedWhere,
		where
	});

	return prisma.eventTier.findMany({
		where: combinedWhere,
		orderBy,
		...(typeof limit === 'number' ? { take: Math.max(1, Math.floor(limit)) } : {})
	});
}

export async function findFirstEventTier({ where }: { where: Prisma.EventTierWhereInput }) {
	return prisma.eventTier.findFirst({
		where
	});
}

function buildEventTierWhere({ eventTierIds, eventTierId, isActive, query = '' }: Omit<EventTierFilters, 'where'>): Prisma.EventTierWhereInput {
	const trimmedQuery = query.trim();

	return {
		...(eventTierIds ? { id: { in: eventTierIds } } : {}),
		...(typeof eventTierId === 'number' ? { id: eventTierId } : {}),
		...(typeof isActive === 'boolean' ? { isActive } : {}),
		...(trimmedQuery.length > 0
			? {
					OR: [
						{
							name: {
								contains: trimmedQuery,
								mode: 'insensitive'
							}
						},
						{
							code: {
								contains: trimmedQuery,
								mode: 'insensitive'
							}
						},
						{
							description: {
								contains: trimmedQuery,
								mode: 'insensitive'
							}
						}
					]
				}
			: {})
	};
}

function combineWhereConditions({
	derivedWhere,
	where
}: {
	derivedWhere: Prisma.EventTierWhereInput;
	where?: Prisma.EventTierWhereInput;
}): Prisma.EventTierWhereInput | undefined {
	if (!where) {
		return derivedWhere;
	}

	return {
		AND: [derivedWhere, where]
	};
}
