import { EventSessionState } from '@prisma/client';

const EVENT_SESSION_STATE_LABELS: Record<EventSessionState, string> = {
	[EventSessionState.DRAFT]: 'Draft',
	[EventSessionState.CANCELLED]: 'Cancelled',
	[EventSessionState.ACTIVE]: 'Active',
	[EventSessionState.ENDED_PENDING_REVIEW]: 'Ended Pending Review',
	[EventSessionState.FINALIZED_WITH_MERITS]: 'Finalized with Merits',
	[EventSessionState.FINALIZED_NO_MERITS]: 'Finalized without Merits'
};

export function formatEventSessionStateLabel(state: EventSessionState): string {
	return EVENT_SESSION_STATE_LABELS[state];
}
