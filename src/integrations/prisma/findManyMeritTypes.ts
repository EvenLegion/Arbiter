import { MeritTypeCode, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';

type FindManyMeritTypesParams = {
	query?: string;
	where?: Prisma.MeritTypeWhereInput;
	orderBy?: Prisma.MeritTypeOrderByWithRelationInput[];
	limit?: number;
};

const FIND_MANY_MERIT_TYPES_SCHEMA = z.object({
	query: z.string().default(''),
	limit: z.number().int().positive().optional()
});

export async function findManyMeritTypes({ query = '', where, orderBy, limit }: FindManyMeritTypesParams = {}) {
	const parsed = FIND_MANY_MERIT_TYPES_SCHEMA.parse({
		query,
		limit
	});

	const derivedWhere = buildMeritTypeWhere({
		query: parsed.query
	});
	const combinedWhere = combineWhereConditions({
		derivedWhere,
		where
	});

	return prisma.meritType.findMany({
		where: combinedWhere,
		orderBy,
		...(typeof parsed.limit === 'number' ? { take: Math.max(1, Math.floor(parsed.limit)) } : {})
	});
}

function buildMeritTypeWhere({ query = '' }: { query: string }): Prisma.MeritTypeWhereInput {
	const trimmedQuery = query.trim();
	const matchingCodes = resolveMatchingMeritTypeCodes(trimmedQuery);

	return trimmedQuery.length > 0
		? {
				OR: [
					...(matchingCodes.length > 0
						? [
								{
									code: {
										in: matchingCodes
									}
								}
							]
						: []),
					{
						name: {
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
		: {};
}

function resolveMatchingMeritTypeCodes(query: string): MeritTypeCode[] {
	if (query.length === 0) {
		return [];
	}

	const normalizedQuery = query.trim().toUpperCase();
	return Object.values(MeritTypeCode).filter((code) => code.includes(normalizedQuery));
}

function combineWhereConditions({
	derivedWhere,
	where
}: {
	derivedWhere: Prisma.MeritTypeWhereInput;
	where?: Prisma.MeritTypeWhereInput;
}): Prisma.MeritTypeWhereInput | undefined {
	if (!where) {
		return derivedWhere;
	}

	return {
		AND: [derivedWhere, where]
	};
}
