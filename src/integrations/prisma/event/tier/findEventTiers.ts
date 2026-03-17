import type { Prisma } from '@prisma/client';

import { combineWhereConditions } from '../combineWhereConditions';
import { buildEventTierWhere } from './buildEventTierWhere';
import { parseFindFirstEventTierInput, parseFindManyEventTiersInput } from './eventTierQuerySchemas';
import { prisma } from '../../prisma';

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

export async function findManyEventTiers({ eventTierIds, eventTierId, query = '', where, orderBy, limit }: FindManyEventTiersParams = {}) {
	const parsed = parseFindManyEventTiersInput({
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
	parseFindFirstEventTierInput({
		where
	});

	return prisma.eventTier.findFirst({
		where,
		include: {
			meritType: true
		}
	});
}
