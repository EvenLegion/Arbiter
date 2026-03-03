import { EventSessionState } from '@prisma/client';
import { prisma } from '../prisma';

type FindManyActiveEventSessionsByIdsParams = {
	eventSessionIds: number[];
};

export async function findManyActiveEventSessionsByIds({ eventSessionIds }: FindManyActiveEventSessionsByIdsParams) {
	if (eventSessionIds.length === 0) {
		return [];
	}

	return prisma.eventSession.findMany({
		where: {
			id: {
				in: eventSessionIds
			},
			state: EventSessionState.ACTIVE
		},
		include: {
			channels: true
		}
	});
}
