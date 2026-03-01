import { EventSessionState } from '@prisma/client';
import { prisma } from '../prisma';

type ActivateDraftEventSessionParams = {
	eventSessionId: number;
	startedAt: Date;
};

export async function activateDraftEventSession({ eventSessionId, startedAt }: ActivateDraftEventSessionParams) {
	const result = await prisma.eventSession.updateMany({
		where: {
			id: eventSessionId,
			state: EventSessionState.DRAFT
		},
		data: {
			state: EventSessionState.ACTIVE,
			startedAt
		}
	});

	return result.count === 1;
}
