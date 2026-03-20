import { EventSessionChannelKind, type EventSessionChannelKind as EventSessionChannelKindType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../prisma';

type DeleteManyEventSessionChannelsParams = {
	eventSessionId: number;
	kinds?: EventSessionChannelKindType[];
};

const EVENT_SESSION_CHANNEL_KIND_SCHEMA = z.enum(EventSessionChannelKind);
const DELETE_MANY_EVENT_SESSION_CHANNELS_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	kinds: z.array(EVENT_SESSION_CHANNEL_KIND_SCHEMA).optional()
});

export async function deleteManyEventSessionChannels({ eventSessionId, kinds }: DeleteManyEventSessionChannelsParams) {
	const parsed = DELETE_MANY_EVENT_SESSION_CHANNELS_SCHEMA.parse({
		eventSessionId,
		kinds
	});

	const result = await prisma.eventChannel.deleteMany({
		where: {
			eventSessionId: parsed.eventSessionId,
			...(parsed.kinds && parsed.kinds.length > 0 ? { kind: { in: parsed.kinds } } : {})
		}
	});

	return result.count;
}
