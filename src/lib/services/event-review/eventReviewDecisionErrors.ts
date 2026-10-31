import type { EventSessionState } from '@prisma/client';

export class EventReviewDecisionLockedError extends Error {
	public constructor(public readonly currentState: EventSessionState | null) {
		super('Event review decisions can only be changed while review is pending.');
		this.name = 'EventReviewDecisionLockedError';
	}
}
