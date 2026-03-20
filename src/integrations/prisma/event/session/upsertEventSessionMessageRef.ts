import { EventSessionMessageKind, type EventSessionMessageKind as EventSessionMessageKindType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../prisma';

type UpsertEventSessionMessageRefParams = {
	eventSessionId: number;
	kind: EventSessionMessageKindType;
	channelId: string;
	messageId: string;
};

const EVENT_SESSION_MESSAGE_KIND_SCHEMA = z.enum(EventSessionMessageKind);
const UPSERT_EVENT_SESSION_MESSAGE_REF_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	kind: EVENT_SESSION_MESSAGE_KIND_SCHEMA,
	channelId: z.string().min(1),
	messageId: z.string().min(1)
});

export async function upsertEventSessionMessageRef({ eventSessionId, kind, channelId, messageId }: UpsertEventSessionMessageRefParams) {
	const parsed = UPSERT_EVENT_SESSION_MESSAGE_REF_SCHEMA.parse({
		eventSessionId,
		kind,
		channelId,
		messageId
	});

	return prisma.eventMessage.upsert({
		where: {
			eventSessionId_kind: {
				eventSessionId: parsed.eventSessionId,
				kind: parsed.kind
			}
		},
		update: {
			channelId: parsed.channelId,
			messageId: parsed.messageId
		},
		create: {
			eventSessionId: parsed.eventSessionId,
			kind: parsed.kind,
			channelId: parsed.channelId,
			messageId: parsed.messageId
		}
	});
}
