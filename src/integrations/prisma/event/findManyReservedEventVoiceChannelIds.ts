import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Returns voice channel IDs already reserved by draft/active event sessions,
 * including both parent and child VC associations.
 */
export async function findManyReservedEventVoiceChannelIds() {
	const rows = await prisma.eventSessionChannel.findMany({
		where: {
			kind: {
				in: [EventSessionChannelKind.PARENT_VC, EventSessionChannelKind.CHILD_VC]
			},
			eventSession: {
				state: {
					in: [EventSessionState.DRAFT, EventSessionState.ACTIVE]
				}
			}
		},
		select: {
			channelId: true
		},
		distinct: ['channelId']
	});

	return rows.map((row) => row.channelId);
}
