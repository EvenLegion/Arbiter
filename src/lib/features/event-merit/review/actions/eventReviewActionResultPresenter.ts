import type { RefreshEventReviewPageResult, RecordEventReviewDecisionResult } from '../../../../services/event-review/eventReviewService';
import type { FinalizeEventReviewLifecycleResult } from '../../../../services/event-lifecycle';
import { formatEventSessionStateLabel } from '../../presentation/shared/formatEventSessionStateLabel';
import { EventSessionState } from '@prisma/client';

export function presentRefreshEventReviewPageResult(result: RefreshEventReviewPageResult) {
	if (result.kind === 'event_not_found') {
		return 'Event session not found.';
	}
	if (result.kind === 'invalid_state') {
		return `Event review is not available in state ${formatEventSessionStateLabel(result.currentState)}.`;
	}

	return result.synced ? null : 'Could not refresh the review message. Please try again.';
}

export function presentRecordEventReviewDecisionResult(result: RecordEventReviewDecisionResult) {
	if (result.kind === 'recipient_ineligible')
		return result.eligibility === 'not_org_member'
			? 'Not eligible for merit: not part of the org.'
			: 'Merit eligibility unavailable. Please refresh and try again.';
	if (result.kind === 'forbidden') {
		return 'Only staff or Centurions can perform this action.';
	}
	if (result.kind === 'event_not_found') {
		return 'Event session not found.';
	}
	if (result.kind === 'invalid_state') {
		return `Event review is not available in state ${formatEventSessionStateLabel(result.currentState)}.`;
	}
	if (result.kind === 'review_locked') {
		return 'Review decisions are locked because this event is already finalized.';
	}

	return result.synced ? null : 'Could not refresh the review message. Please try again.';
}

export function presentFinalizeEventReviewResult(result: FinalizeEventReviewLifecycleResult) {
	if (result.kind === 'forbidden') {
		return 'Only staff or Centurions can perform this action.';
	}
	if (result.kind === 'reviewer_not_found') {
		return 'Could not resolve your database user for review finalization.';
	}
	if (result.kind === 'event_not_found') {
		return 'Event session not found.';
	}
	if (result.kind === 'invalid_state') {
		return result.currentState === EventSessionState.FINALIZED_WITH_MERITS || result.currentState === EventSessionState.FINALIZED_NO_MERITS
			? 'This event review has already been finalized.'
			: `Event review is not available in state ${formatEventSessionStateLabel(result.currentState)}.`;
	}
	if (result.kind === 'eligibility_unavailable') {
		return 'Merit eligibility unavailable. No merits were awarded and the review remains open. Please try again.';
	}
	if (result.kind === 'state_conflict') {
		return 'Unable to finalize event review. It may have already been finalized by another reviewer.';
	}

	return result.reviewMessageSynced ? null : 'Could not refresh the review message. Please try again.';
}
