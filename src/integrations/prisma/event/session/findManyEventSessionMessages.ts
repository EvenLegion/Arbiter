import { EventSessionMessageKind, type EventSessionMessageKind as EventSessionMessageKindType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../prisma';

type FindManyEventSessionMessagesParams = {
	eventSessionId: number;
	kinds?: EventSessionMessageKindType[];
};

const EVENT_SESSION_MESSAGE_KIND_SCHEMA = z.enum(EventSessionMessageKind);
const FIND_MANY_EVENT_SESSION_MESSAGES_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	kinds: z.array(EVENT_SESSION_MESSAGE_KIND_SCHEMA).optional()
});

export async function findManyEventSessionMessages({ eventSessionId, kinds }: FindManyEventSessionMessagesParams) {
	const parsed = FIND_MANY_EVENT_SESSION_MESSAGES_SCHEMA.parse({
		eventSessionId,
		kinds
	});

	return prisma.eventMessage.findMany({
		where: {
			eventSessionId: parsed.eventSessionId,
			...(parsed.kinds && parsed.kinds.length > 0 ? { kind: { in: parsed.kinds } } : {})
		},
		orderBy: {
			id: 'asc'
		}
	});
}
