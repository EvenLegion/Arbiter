import type { EventSessionMessageKind } from '@prisma/client';
import { prisma } from '../prisma';

type UpsertEventSessionMessageRefParams = {
	eventSessionId: number;
	kind: EventSessionMessageKind;
	channelId: string;
	messageId: string;
};

export async function upsertEventSessionMessageRef({ eventSessionId, kind, channelId, messageId }: UpsertEventSessionMessageRefParams) {
	return prisma.eventSessionMessage.upsert({
		where: {
			eventSessionId_kind: {
				eventSessionId,
				kind
			}
		},
		update: {
			channelId,
			messageId
		},
		create: {
			eventSessionId,
			kind,
			channelId,
			messageId
		}
	});
}
