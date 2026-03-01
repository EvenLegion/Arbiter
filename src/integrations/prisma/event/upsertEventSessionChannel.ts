import { EventSessionChannelKind } from '@prisma/client';
import { prisma } from '../prisma';

type UpsertEventSessionChannelParams = {
	eventSessionId: number;
	channelId: string;
	kind: EventSessionChannelKind;
	addedByDbUserId: string;
};

export async function upsertEventSessionChannel({ eventSessionId, channelId, kind, addedByDbUserId }: UpsertEventSessionChannelParams) {
	return prisma.eventSessionChannel.upsert({
		where: {
			eventSessionId_channelId: {
				eventSessionId,
				channelId
			}
		},
		update: {
			kind,
			addedByUserId: addedByDbUserId
		},
		create: {
			eventSessionId,
			channelId,
			kind,
			addedByUserId: addedByDbUserId
		}
	});
}
