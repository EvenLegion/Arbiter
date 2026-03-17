import { eventRepository } from '../../../../integrations/prisma/repositories';

export function createManualMeritLinkedEventGateway() {
	return async (eventSessionId: number) => {
		const linkedEvent = await eventRepository.getSession({
			eventSessionId
		});
		if (!linkedEvent) {
			return null;
		}

		return {
			id: linkedEvent.id,
			name: linkedEvent.name,
			createdAt: linkedEvent.createdAt
		};
	};
}
