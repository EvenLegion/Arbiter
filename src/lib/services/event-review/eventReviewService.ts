import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import type { EventReviewPage } from '../../../integrations/prisma/repositories';

const VIEWABLE_REVIEW_STATES = new Set<EventSessionState>([
	EventSessionState.ENDED_PENDING_REVIEW,
	EventSessionState.FINALIZED_WITH_MERITS,
	EventSessionState.FINALIZED_NO_MERITS
]);

type ReviewEventLookup = {
	id: number;
	state: EventSessionState;
};

type RecordEventReviewDecisionDeps = {
	findEventSession: (eventSessionId: number) => Promise<ReviewEventLookup | null>;
	saveDecision: (params: { eventSessionId: number; targetDbUserId: string; decision: EventReviewDecisionKind }) => Promise<void>;
	syncReviewMessage: (params: { eventSessionId: number; page: number }) => Promise<boolean>;
};

type LoadEventReviewPageDeps = {
	getReviewPage: (params: { eventSessionId: number; page: number }) => Promise<EventReviewPage | null>;
};

type RefreshEventReviewPageDeps = LoadEventReviewPageDeps & {
	syncReviewMessage: (params: { eventSessionId: number; page: number }) => Promise<boolean>;
};

export type RecordEventReviewDecisionResult =
	| { kind: 'forbidden' }
	| { kind: 'event_not_found' }
	| { kind: 'invalid_state'; currentState: EventSessionState }
	| { kind: 'review_locked'; currentState: EventSessionState }
	| { kind: 'decision_saved'; synced: boolean };

export type LoadEventReviewPageResult =
	| { kind: 'event_not_found' }
	| { kind: 'invalid_state'; currentState: EventSessionState }
	| { kind: 'page_ready'; reviewPage: EventReviewPage };

export type RefreshEventReviewPageResult =
	| { kind: 'event_not_found' }
	| { kind: 'invalid_state'; currentState: EventSessionState }
	| { kind: 'page_refreshed'; synced: boolean };

export async function recordEventReviewDecision(
	deps: RecordEventReviewDecisionDeps,
	input: {
		actor: ActorContext;
		eventSessionId: number;
		targetDbUserId: string;
		decision: EventReviewDecisionKind;
		page: number;
	}
): Promise<RecordEventReviewDecisionResult> {
	if (!input.actor.capabilities.isStaff && !input.actor.capabilities.isCenturion) {
		return {
			kind: 'forbidden'
		};
	}

	const eventSession = await deps.findEventSession(input.eventSessionId);
	if (!eventSession) {
		return {
			kind: 'event_not_found'
		};
	}
	if (!VIEWABLE_REVIEW_STATES.has(eventSession.state)) {
		return {
			kind: 'invalid_state',
			currentState: eventSession.state
		};
	}
	if (eventSession.state !== EventSessionState.ENDED_PENDING_REVIEW) {
		return {
			kind: 'review_locked',
			currentState: eventSession.state
		};
	}

	await deps.saveDecision({
		eventSessionId: input.eventSessionId,
		targetDbUserId: input.targetDbUserId,
		decision: input.decision
	});

	return {
		kind: 'decision_saved',
		synced: await deps.syncReviewMessage({
			eventSessionId: input.eventSessionId,
			page: input.page
		})
	};
}

export async function loadEventReviewPage(
	deps: LoadEventReviewPageDeps,
	input: {
		eventSessionId: number;
		page: number;
	}
): Promise<LoadEventReviewPageResult> {
	const reviewPage = await deps.getReviewPage({
		eventSessionId: input.eventSessionId,
		page: input.page
	});
	if (!reviewPage) {
		return {
			kind: 'event_not_found'
		};
	}
	if (!VIEWABLE_REVIEW_STATES.has(reviewPage.eventSession.state)) {
		return {
			kind: 'invalid_state',
			currentState: reviewPage.eventSession.state
		};
	}

	return {
		kind: 'page_ready',
		reviewPage
	};
}

export async function refreshEventReviewPage(
	deps: RefreshEventReviewPageDeps,
	input: {
		eventSessionId: number;
		page: number;
	}
): Promise<RefreshEventReviewPageResult> {
	const pageResult = await loadEventReviewPage(
		{
			getReviewPage: deps.getReviewPage
		},
		input
	);
	if (pageResult.kind !== 'page_ready') {
		return pageResult;
	}

	return {
		kind: 'page_refreshed',
		synced: await deps.syncReviewMessage({
			eventSessionId: input.eventSessionId,
			page: input.page
		})
	};
}
