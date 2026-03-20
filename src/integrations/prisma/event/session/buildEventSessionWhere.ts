import type { EventSessionState, Prisma } from '@prisma/client';

export function buildEventSessionWhere({
	eventSessionIds,
	states,
	query = ''
}: {
	eventSessionIds?: number[];
	states?: EventSessionState[];
	query?: string;
}): Prisma.EventWhereInput {
	const trimmedQuery = query.trim();

	return {
		...(eventSessionIds ? { id: { in: eventSessionIds } } : {}),
		...(states && states.length > 0 ? { state: { in: states } } : {}),
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
							eventTier: {
								name: {
									contains: trimmedQuery,
									mode: 'insensitive'
								}
							}
						}
					]
				}
			: {})
	};
}
