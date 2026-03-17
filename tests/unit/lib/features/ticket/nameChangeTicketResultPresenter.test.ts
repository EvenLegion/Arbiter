import { describe, expect, it } from 'vitest';

import { presentNameChangeTicketResult } from '../../../../../src/lib/features/ticket/nameChangeTicketResultPresenter';

describe('nameChangeTicketResultPresenter', () => {
	it('marks missing requester failures as request-id aware failures', () => {
		expect(
			presentNameChangeTicketResult({
				kind: 'requester_not_found'
			})
		).toEqual({
			delivery: 'fail',
			content: 'User not found in database. Please contact staff with:',
			requestId: true
		});
	});

	it('formats created requests with stripped-prefix guidance', () => {
		expect(
			presentNameChangeTicketResult({
				kind: 'created',
				requestId: 7,
				reviewThreadId: '9001',
				requestedName: 'WhyIt',
				strippedDivisionPrefix: '[NVY]'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Name change request created.\nReview thread: <#9001>\nNote: I removed your division prefix from the requested name.'
		});
	});
});
