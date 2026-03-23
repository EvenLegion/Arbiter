import { EventSessionState } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import type { EventLifecycleEventSession, EventReviewFinalizationResult } from './eventLifecycleTypes';

type FinalizeEventReviewDeps = {
	findEventSession: (eventSessionId: number) => Promise<{
		id: number;
		state: EventSessionState;
	} | null>;
	finalizeReview: (params: {
		eventSessionId: number;
		reviewerDbUserId: string;
		mode: 'with' | 'without';
	}) => Promise<EventReviewFinalizationResult>;
	syncAwardedNicknames: (params: { awardedUsers: EventReviewFinalizationResult['awardedUsers'] }) => Promise<void>;
	reloadEventSession: (eventSessionId: number) => Promise<EventLifecycleEventSession | null>;
	syncTrackingSummary: (eventSession: EventLifecycleEventSession) => Promise<void>;
	postReviewSubmissionMessages: (params: {
		eventSession: EventLifecycleEventSession;
		actorDiscordUserId: string;
		mode: 'with' | 'without';
	}) => Promise<void>;
	deleteTrackedChannelRows: (eventSessionId: number) => Promise<number>;
	syncReviewMessage: (params: { eventSessionId: number; page: number }) => Promise<boolean>;
};

export type FinalizeEventReviewLifecycleResult =
	| { kind: 'forbidden' }
	| { kind: 'reviewer_not_found' }
	| { kind: 'event_not_found' }
	| { kind: 'invalid_state'; currentState: EventSessionState }
	| { kind: 'state_conflict' }
	| {
			kind: 'review_finalized';
			toState: EventReviewFinalizationResult['toState'];
			awardedCount: number;
			reviewMessageSynced: boolean;
	  };

export async function finalizeEventReviewLifecycle(
	deps: FinalizeEventReviewDeps,
	input: {
		actor: ActorContext;
		eventSessionId: number;
		mode: 'with' | 'without';
	}
): Promise<FinalizeEventReviewLifecycleResult> {
	if (!input.actor.capabilities.isStaff && !input.actor.capabilities.isCenturion) {
		return {
			kind: 'forbidden'
		};
	}
	if (!input.actor.dbUserId) {
		return {
			kind: 'reviewer_not_found'
		};
	}

	const eventSession = await deps.findEventSession(input.eventSessionId);
	if (!eventSession) {
		return {
			kind: 'event_not_found'
		};
	}
	if (eventSession.state !== EventSessionState.ENDED_PENDING_REVIEW) {
		return {
			kind: 'invalid_state',
			currentState: eventSession.state
		};
	}

	const finalizeResult = await deps.finalizeReview({
		eventSessionId: input.eventSessionId,
		reviewerDbUserId: input.actor.dbUserId,
		mode: input.mode
	});
	if (!finalizeResult.finalized) {
		return {
			kind: 'state_conflict'
		};
	}

	await deps.syncAwardedNicknames({
		awardedUsers: finalizeResult.awardedUsers
	});

	const finalizedSession = await deps.reloadEventSession(input.eventSessionId);
	if (finalizedSession) {
		await deps.syncTrackingSummary(finalizedSession);
		await deps.postReviewSubmissionMessages({
			eventSession: finalizedSession,
			actorDiscordUserId: input.actor.discordUserId,
			mode: input.mode
		});
		await deps.deleteTrackedChannelRows(finalizedSession.id);

		const cleanedSession = await deps.reloadEventSession(input.eventSessionId);
		if (cleanedSession) {
			await deps.syncTrackingSummary(cleanedSession);
		}
	}

	return {
		kind: 'review_finalized',
		toState: finalizeResult.toState,
		awardedCount: finalizeResult.awardedCount,
		reviewMessageSynced: await deps.syncReviewMessage({
			eventSessionId: input.eventSessionId,
			page: 1
		})
	};
}
