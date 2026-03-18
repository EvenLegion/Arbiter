import type { ExecutionContext } from '../../../../logging/executionContext';
import { initializeEventReviewState } from '../../../../services/event-lifecycle/eventLifecycleService';
import { createInitializeEventReviewDeps } from './createInitializeEventReviewDeps';

type InitializeEventReviewParams = {
	guild: import('discord.js').Guild;
	eventSessionId: number;
	context: ExecutionContext;
};

export async function initializeEventReview({ guild, eventSessionId, context }: InitializeEventReviewParams) {
	const caller = 'initializeEventReview';
	const logger = context.logger.child({
		caller,
		eventSessionId
	});

	const result = await initializeEventReviewState(
		createInitializeEventReviewDeps({
			guild,
			logger
		}),
		{
			eventSessionId
		}
	);

	if (result.kind === 'event_not_found') {
		throw new Error(`Event session not found while initializing review: eventSessionId=${eventSessionId}`);
	}
	if (result.kind === 'invalid_state') {
		logger.info(
			{
				state: result.currentState
			},
			'Skipping event review initialization because event is not ENDED_PENDING_REVIEW'
		);
		return;
	}
	if (result.kind === 'review_initialized_sync_failed') {
		throw new Error(`Failed to create or update review message for eventSessionId=${eventSessionId}`);
	}

	logger.info(
		{
			durationSeconds: result.durationSeconds,
			snapshotParticipantCount: result.snapshotParticipantCount,
			persistedParticipantCount: result.persistedParticipantCount
		},
		'event.review.initialized'
	);
}
