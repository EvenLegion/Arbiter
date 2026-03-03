import { EventSessionState } from '@prisma/client';
import { prisma } from '../prisma';

type EndActiveEventSessionParams = {
	eventSessionId: number;
	endedAt: Date;
};

export async function endActiveEventSession({ eventSessionId, endedAt }: EndActiveEventSessionParams) {
	const result = await prisma.eventSession.updateMany({
		where: {
			id: eventSessionId,
			state: EventSessionState.ACTIVE
		},
		data: {
			state: EventSessionState.ENDED_PENDING_REVIEW,
			endedAt
		}
	});

	return result.count === 1;
}
