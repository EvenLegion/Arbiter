import { describe, expect, it } from 'vitest';

import { presentEventStartResult } from '../../../../../../src/lib/features/event-merit/session/draft/eventStartResultPresenter';

describe('eventStartResultPresenter', () => {
	it('maps missing tiers to an inline edit-reply failure', () => {
		expect(
			presentEventStartResult({
				kind: 'tier_not_found'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Selected event tier is not available.'
		});
	});

	it('maps tracking thread failures to request-id aware failures', () => {
		expect(
			presentEventStartResult({
				kind: 'tracking_thread_failed'
			})
		).toEqual({
			delivery: 'fail',
			content: 'Failed to create the event tracking thread. Please contact a TECH member with the following:',
			requestId: true
		});
	});

	it('maps successful draft creation to reply deletion', () => {
		expect(
			presentEventStartResult({
				kind: 'draft_created',
				eventSessionId: 3,
				trackingThreadId: 'thread-1'
			})
		).toEqual({
			delivery: 'deleteReply'
		});
	});
});
