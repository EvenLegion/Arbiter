import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';

type EventTierFilters = {
	eventTierIds?: number[];
	eventTierId?: number;
	query?: string;
	where?: Prisma.EventTierWhereInput;
};

type FindManyEventTiersParams = EventTierFilters & {
	orderBy?: Prisma.EventTierOrderByWithRelationInput[];
	limit?: number;
};

const FIND_MANY_EVENT_TIERS_SCHEMA = z.object({
	eventTierIds: z.array(z.number().int().positive()).optional(),
	eventTierId: z.number().int().positive().optional(),
	query: z.string().default(''),
	limit: z.number().int().positive().optional()
});

const FIND_FIRST_EVENT_TIER_SCHEMA = z.object({
	where: z.record(z.string(), z.unknown())
});

export async function findManyEventTiers({ eventTierIds, eventTierId, query = '', where, orderBy, limit }: FindManyEventTiersParams = {}) {
	const parsed = FIND_MANY_EVENT_TIERS_SCHEMA.parse({
		eventTierIds,
		eventTierId,
		query,
		limit
	});
	if (parsed.eventTierIds && parsed.eventTierIds.length === 0) {
		return [];
	}

	const derivedWhere = buildEventTierWhere({
		eventTierIds: parsed.eventTierIds,
		eventTierId: parsed.eventTierId,
		query: parsed.query
	});
	const combinedWhere = combineWhereConditions({
		derivedWhere,
		where
	});

	return prisma.eventTier.findMany({
		where: combinedWhere,
		include: {
			meritType: true
		},
		orderBy,
		...(typeof parsed.limit === 'number' ? { take: Math.max(1, Math.floor(parsed.limit)) } : {})
	});
}

export async function findFirstEventTier({ where }: { where: Prisma.EventTierWhereInput }) {
	FIND_FIRST_EVENT_TIER_SCHEMA.parse({
		where
	});

	return prisma.eventTier.findFirst({
		where,
		include: {
			meritType: true
		}
	});
}

function buildEventTierWhere({ eventTierIds, eventTierId, query = '' }: Omit<EventTierFilters, 'where'>): Prisma.EventTierWhereInput {
	const trimmedQuery = query.trim();

	return {
		...(eventTierIds ? { id: { in: eventTierIds } } : {}),
		...(typeof eventTierId === 'number' ? { id: eventTierId } : {}),
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
