import { MeritTypeCode, type Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../prisma';

const LIST_MERIT_TYPES_SCHEMA = z.object({
	query: z.string().default(''),
	limit: z.number().int().positive().optional()
});

export function listMeritTypes(
	params: {
		query?: string;
		where?: Prisma.MeritTypeWhereInput;
		orderBy?: Prisma.MeritTypeOrderByWithRelationInput[];
		limit?: number;
	} = {}
) {
	const parsed = LIST_MERIT_TYPES_SCHEMA.parse({
		query: params.query,
		limit: params.limit
	});
	const trimmedQuery = parsed.query.trim();
	const matchingCodes = trimmedQuery.length === 0 ? [] : Object.values(MeritTypeCode).filter((code) => code.includes(trimmedQuery.toUpperCase()));
	const derivedWhere: Prisma.MeritTypeWhereInput =
		trimmedQuery.length === 0
			? {}
			: {
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
				};
	const where = params.where
		? {
				AND: [derivedWhere, params.where]
			}
		: derivedWhere;

	return prisma.meritType.findMany({
		where,
		orderBy: params.orderBy,
		...(typeof parsed.limit === 'number' ? { take: Math.max(1, Math.floor(parsed.limit)) } : {})
	});
}
