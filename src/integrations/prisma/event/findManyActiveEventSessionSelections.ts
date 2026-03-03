import { EventSessionState } from '@prisma/client';
import { prisma } from '../prisma';

type FindManySelectableEventSessionSelectionsParams = {
	query?: string;
	limit?: number;
};

export async function findManySelectableEventSessionSelections({ query = '', limit = 25 }: FindManySelectableEventSessionSelectionsParams = {}) {
	return prisma.eventSession.findMany({
		where: {
			state: {
				in: [EventSessionState.DRAFT, EventSessionState.ACTIVE]
			},
			...(query.length > 0
				? {
						OR: [
							{
								name: {
									contains: query,
									mode: 'insensitive'
								}
							},
							{
								eventTier: {
									name: {
										contains: query,
										mode: 'insensitive'
									}
								}
							}
						]
					}
				: {})
		},
		include: {
			eventTier: true
		},
		orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
		take: Math.min(limit, 25)
	});
}

/**
 * @deprecated Use findManySelectableEventSessionSelections for draft+active add-vc selection flows.
 */
export const findManyActiveEventSessionSelections = findManySelectableEventSessionSelections;
