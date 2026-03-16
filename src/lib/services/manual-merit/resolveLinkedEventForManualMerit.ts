import type { AwardManualMeritWorkflowResult } from './manualMeritTypes';

export async function resolveLinkedEventForManualMerit({
	findLinkedEvent,
	linkedEventSessionId
}: {
	findLinkedEvent: (eventSessionId: number) => Promise<{
		id: number;
		name: string;
		createdAt: Date;
	} | null>;
	linkedEventSessionId: number | null;
}): Promise<
	| AwardManualMeritWorkflowResult
	| {
			linkedEvent: {
				id: number;
				name: string;
				createdAt: Date;
			} | null;
	  }
> {
	if (typeof linkedEventSessionId !== 'number') {
		return {
			linkedEvent: null
		};
	}

	const linkedEvent = await findLinkedEvent(linkedEventSessionId);
	if (!linkedEvent) {
		return {
			kind: 'linked_event_not_found'
		};
	}

	const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1_000;
	if (linkedEvent.createdAt.getTime() < fiveDaysAgo) {
		return {
			kind: 'linked_event_too_old'
		};
	}

	return {
		linkedEvent
	};
}
