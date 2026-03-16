import { EventSessionState } from '@prisma/client';

export const ALLOWED_EVENT_TRANSITIONS: Record<EventSessionState, readonly EventSessionState[]> = {
	[EventSessionState.DRAFT]: [EventSessionState.ACTIVE, EventSessionState.CANCELLED],
	[EventSessionState.CANCELLED]: [],
	[EventSessionState.ACTIVE]: [EventSessionState.ENDED_PENDING_REVIEW],
	[EventSessionState.ENDED_PENDING_REVIEW]: [EventSessionState.FINALIZED_WITH_MERITS, EventSessionState.FINALIZED_NO_MERITS],
	[EventSessionState.FINALIZED_WITH_MERITS]: [],
	[EventSessionState.FINALIZED_NO_MERITS]: []
};

export function isTransitionAllowed(fromState: EventSessionState, toState: EventSessionState) {
	return ALLOWED_EVENT_TRANSITIONS[fromState].includes(toState);
}
