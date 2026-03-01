import { EventSessionState } from '@prisma/client';
import { prisma } from '../prisma';

type CancelDraftEventSessionParams = {
	eventSessionId: number;
};

export async function cancelDraftEventSession({ eventSessionId }: CancelDraftEventSessionParams) {
	const result = await prisma.eventSession.updateMany({
		where: {
			id: eventSessionId,
			state: EventSessionState.DRAFT
		},
		data: {
			state: EventSessionState.CANCELLED
		}
	});

	return result.count === 1;
}
