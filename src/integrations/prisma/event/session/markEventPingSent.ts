import { EventSessionState } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../prisma';

const MARK_EVENT_PING_SENT_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	sentAt: z.date()
});

export async function markEventPingSent(params: z.infer<typeof MARK_EVENT_PING_SENT_SCHEMA>) {
	const parsed = MARK_EVENT_PING_SENT_SCHEMA.parse(params);
	const result = await prisma.event.updateMany({
		where: {
			id: parsed.eventSessionId,
			state: EventSessionState.ACTIVE,
			eventPingSentAt: null
		},
		data: {
			eventPingSentAt: parsed.sentAt
		}
	});

	return result.count === 1;
}
