import { EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
	presentFinalizeEventReviewResult,
	presentRecordEventReviewDecisionResult,
	presentRefreshEventReviewPageResult
} from '../../../../../../src/lib/features/event-merit/review/actions/eventReviewActionResultPresenter';

describe('eventReviewActionResultPresenter', () => {
	it('formats missing or unsynced review-page refresh results', () => {
		expect(
			presentRefreshEventReviewPageResult({
				kind: 'event_not_found'
			})
		).toBe('Event session not found.');

		expect(
			presentRefreshEventReviewPageResult({
				kind: 'refreshed',
				synced: false
			})
		).toBe('Could not refresh the review message. Please try again.');

		expect(
			presentRefreshEventReviewPageResult({
				kind: 'refreshed',
				synced: true
			})
		).toBeNull();
	});

	it('formats invalid review page state failures', () => {
		expect(
			presentRefreshEventReviewPageResult({
				kind: 'invalid_state',
				currentState: EventSessionState.DRAFT
			})
		).toContain('Draft');
	});

	it('formats review locked decision failures', () => {
		expect(
			presentRecordEventReviewDecisionResult({
				kind: 'review_locked',
				currentState: EventSessionState.FINALIZED_NO_MERITS
			})
		).toBe('Review decisions are locked because this event is already finalized.');
	});

	it('formats other decision workflow failures', () => {
		expect(
			presentRecordEventReviewDecisionResult({
				kind: 'forbidden'
			})
		).toBe('Only staff or Centurions can perform this action.');

		expect(
			presentRecordEventReviewDecisionResult({
				kind: 'event_not_found'
			})
		).toBe('Event session not found.');

		expect(
			presentRecordEventReviewDecisionResult({
				kind: 'invalid_state',
				currentState: EventSessionState.ACTIVE
			})
		).toBe('Event review is not available in state Active.');

		expect(
			presentRecordEventReviewDecisionResult({
				kind: 'decision_recorded',
				synced: false
			})
		).toBe('Could not refresh the review message. Please try again.');

		expect(
			presentRecordEventReviewDecisionResult({
				kind: 'decision_recorded',
				synced: true
			})
		).toBeNull();
	});

	it('formats already-finalized review submissions distinctly', () => {
		expect(
			presentFinalizeEventReviewResult({
				kind: 'invalid_state',
				currentState: EventSessionState.FINALIZED_WITH_MERITS
			})
		).toBe('This event review has already been finalized.');
	});

	it('formats the remaining finalization failures and sync outcomes', () => {
		expect(
			presentFinalizeEventReviewResult({
				kind: 'forbidden'
			})
		).toBe('Only staff or Centurions can perform this action.');

		expect(
			presentFinalizeEventReviewResult({
				kind: 'reviewer_not_found'
			})
		).toBe('Could not resolve your database user for review finalization.');

		expect(
			presentFinalizeEventReviewResult({
				kind: 'event_not_found'
			})
		).toBe('Event session not found.');

		expect(
			presentFinalizeEventReviewResult({
				kind: 'invalid_state',
				currentState: EventSessionState.ACTIVE
			})
		).toBe('Event review is not available in state Active.');

		expect(
			presentFinalizeEventReviewResult({
				kind: 'state_conflict'
			})
		).toBe('Unable to finalize event review. It may have already been finalized by another reviewer.');

		expect(
			presentFinalizeEventReviewResult({
				kind: 'finalized',
				reviewMessageSynced: false,
				eventSessionId: 1,
				eventName: 'Weekly Op',
				newState: EventSessionState.FINALIZED_NO_MERITS,
				awardedMerits: 0
			})
		).toBe('Could not refresh the review message. Please try again.');

		expect(
			presentFinalizeEventReviewResult({
				kind: 'finalized',
				reviewMessageSynced: true,
				eventSessionId: 1,
				eventName: 'Weekly Op',
				newState: EventSessionState.FINALIZED_WITH_MERITS,
				awardedMerits: 4
			})
		).toBeNull();
	});
});
