import type { EventSessionMessageKind } from '@prisma/client';
import { prisma } from '../prisma';

type FindManyEventSessionMessagesParams = {
	eventSessionId: number;
	kinds?: EventSessionMessageKind[];
};

export async function findManyEventSessionMessages({ eventSessionId, kinds }: FindManyEventSessionMessagesParams) {
	return prisma.eventSessionMessage.findMany({
		where: {
			eventSessionId,
			...(kinds && kinds.length > 0 ? { kind: { in: kinds } } : {})
		},
		orderBy: {
			id: 'asc'
		}
	});
}
