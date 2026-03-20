import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../prisma';

type FindReservedEventVoiceChannelReservationParams = {
	channelId: string;
	excludeEventSessionId?: number;
};

const FIND_RESERVED_EVENT_VOICE_CHANNEL_RESERVATION_SCHEMA = z.object({
	channelId: z.string().min(1),
	excludeEventSessionId: z.number().int().positive().optional()
});

export async function findReservedEventVoiceChannelReservation({ channelId, excludeEventSessionId }: FindReservedEventVoiceChannelReservationParams) {
	const parsed = FIND_RESERVED_EVENT_VOICE_CHANNEL_RESERVATION_SCHEMA.parse({
		channelId,
		excludeEventSessionId
	});

	return prisma.eventChannel.findFirst({
		where: {
			channelId: parsed.channelId,
			kind: {
				in: [EventSessionChannelKind.PARENT_VC, EventSessionChannelKind.CHILD_VC]
			},
			...(parsed.excludeEventSessionId ? { eventSessionId: { not: parsed.excludeEventSessionId } } : {}),
			eventSession: {
				state: {
					in: [EventSessionState.DRAFT, EventSessionState.ACTIVE]
				}
			}
		},
		select: {
			eventSessionId: true,
			kind: true,
			eventSession: {
				select: {
					name: true,
					state: true
				}
			}
		}
	});
}
