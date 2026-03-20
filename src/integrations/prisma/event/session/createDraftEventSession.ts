import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../prisma';

type CreateDraftEventSessionParams = {
	hostDbUserId: string;
	eventTierId: number;
	threadId: string;
	name: string;
	primaryChannelId: string;
	addedByDbUserId: string;
};

const CREATE_DRAFT_EVENT_SESSION_SCHEMA = z.object({
	hostDbUserId: z.string().min(1),
	eventTierId: z.number().int().positive(),
	threadId: z.string().min(1),
	name: z.string().min(1),
	primaryChannelId: z.string().min(1),
	addedByDbUserId: z.string().min(1)
});

export async function createDraftEventSession({
	hostDbUserId,
	eventTierId,
	threadId,
	name,
	primaryChannelId,
	addedByDbUserId
}: CreateDraftEventSessionParams) {
	const parsed = CREATE_DRAFT_EVENT_SESSION_SCHEMA.parse({
		hostDbUserId,
		eventTierId,
		threadId,
		name,
		primaryChannelId,
		addedByDbUserId
	});

	return prisma.event.create({
		data: {
			hostUserId: parsed.hostDbUserId,
			eventTierId: parsed.eventTierId,
			threadId: parsed.threadId,
			name: parsed.name,
			state: EventSessionState.DRAFT,
			channels: {
				create: {
					channelId: parsed.primaryChannelId,
					kind: EventSessionChannelKind.PARENT_VC,
					addedByUserId: parsed.addedByDbUserId
				}
			}
		},
		include: {
			eventTier: true,
			channels: true
		}
	});
}
