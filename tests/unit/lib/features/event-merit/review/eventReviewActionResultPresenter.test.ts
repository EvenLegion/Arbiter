import { EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
	presentFinalizeEventReviewResult,
	presentRecordEventReviewDecisionResult,
	presentRefreshEventReviewPageResult
} from '../../../../../../src/lib/features/event-merit/review/eventReviewActionResultPresenter';

describe('eventReviewActionResultPresenter', () => {
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

	it('formats already-finalized review submissions distinctly', () => {
		expect(
			presentFinalizeEventReviewResult({
				kind: 'invalid_state',
				currentState: EventSessionState.FINALIZED_WITH_MERITS
			})
		).toBe('This event review has already been finalized.');
	});
});
