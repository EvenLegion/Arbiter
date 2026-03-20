import type { Prisma } from '@prisma/client';

export function buildEventTierWhere({
	eventTierIds,
	eventTierId,
	query = ''
}: {
	eventTierIds?: number[];
	eventTierId?: number;
	query?: string;
}): Prisma.EventTierWhereInput {
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
