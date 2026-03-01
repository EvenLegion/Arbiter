import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { prisma } from '../prisma';

type CreateDraftEventSessionParams = {
	hostDbUserId: string;
	eventTierId: number;
	threadId: string;
	name: string;
	primaryChannelId: string;
	addedByDbUserId: string;
};

export async function createDraftEventSession({
	hostDbUserId,
	eventTierId,
	threadId,
	name,
	primaryChannelId,
	addedByDbUserId
}: CreateDraftEventSessionParams) {
	return prisma.eventSession.create({
		data: {
			hostUserId: hostDbUserId,
			eventTierId,
			threadId,
			name,
			state: EventSessionState.DRAFT,
			channels: {
				create: {
					channelId: primaryChannelId,
					kind: EventSessionChannelKind.PARENT_VC,
					addedByUserId: addedByDbUserId
				}
			}
		},
		include: {
			eventTier: true,
			channels: true
		}
	});
}
