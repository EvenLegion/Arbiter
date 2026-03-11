import { EventSessionChannelKind } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';

type UpsertEventSessionChannelParams = {
	eventSessionId: number;
	channelId: string;
	kind: EventSessionChannelKind;
	addedByDbUserId: string;
};

const EVENT_SESSION_CHANNEL_KIND_SCHEMA = z.enum(EventSessionChannelKind);
const UPSERT_EVENT_SESSION_CHANNEL_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	channelId: z.string().min(1),
	kind: EVENT_SESSION_CHANNEL_KIND_SCHEMA,
	addedByDbUserId: z.string().min(1)
});

export async function upsertEventSessionChannel({ eventSessionId, channelId, kind, addedByDbUserId }: UpsertEventSessionChannelParams) {
	const parsed = UPSERT_EVENT_SESSION_CHANNEL_SCHEMA.parse({
		eventSessionId,
		channelId,
		kind,
		addedByDbUserId
	});

	return prisma.eventChannel.upsert({
		where: {
			eventSessionId_channelId: {
				eventSessionId: parsed.eventSessionId,
				channelId: parsed.channelId
			}
		},
		update: {
			kind: parsed.kind,
			addedByUserId: parsed.addedByDbUserId
		},
		create: {
			eventSessionId: parsed.eventSessionId,
			channelId: parsed.channelId,
			kind: parsed.kind,
			addedByUserId: parsed.addedByDbUserId
		}
	});
}
