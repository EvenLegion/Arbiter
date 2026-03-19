import { describe, expect, it } from 'vitest';

import { presentNameChangeTicketResult } from '../../../../../../src/lib/features/ticket/request/presentNameChangeTicketResult';

describe('presentNameChangeTicketResult', () => {
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

	it('maps validation and persistence failures to the right delivery types', () => {
		expect(
			presentNameChangeTicketResult({
				kind: 'invalid_requested_name',
				errorMessage: 'Requested name cannot contain brackets.'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Requested name cannot contain brackets.'
		});

		expect(
			presentNameChangeTicketResult({
				kind: 'requester_member_not_found'
			})
		).toEqual({
			delivery: 'fail',
			content: 'Could not resolve your member record. Please contact staff with:',
			requestId: true
		});

		expect(
			presentNameChangeTicketResult({
				kind: 'nickname_too_long'
			})
		).toEqual({
			delivery: 'editReply',
			content:
				'Requested name is too long after organization formatting/rank is applied. Please submit a shorter name that fits Discord nickname limits.'
		});

		expect(
			presentNameChangeTicketResult({
				kind: 'validation_failed'
			})
		).toEqual({
			delivery: 'fail',
			content: 'Could not validate requested name. Please contact staff with:',
			requestId: true
		});

		expect(
			presentNameChangeTicketResult({
				kind: 'request_creation_failed'
			})
		).toEqual({
			delivery: 'fail',
			content: 'Failed to create name change request. Please contact staff with:',
			requestId: true
		});
	});

	it('surfaces downstream review-thread failures inline', () => {
		expect(
			presentNameChangeTicketResult({
				kind: 'review_thread_failed',
				requestId: 12
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Request created but failed to create review thread. Please contact staff with: requestId=12'
		});

		expect(
			presentNameChangeTicketResult({
				kind: 'review_thread_reference_failed',
				requestId: 13
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Name change request thread was created, but I could not persist its review reference. Please contact staff with: requestId=13'
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

		expect(
			presentNameChangeTicketResult({
				kind: 'created',
				requestId: 8,
				reviewThreadId: '9002',
				requestedName: 'WhyIt',
				strippedDivisionPrefix: null
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Name change request created.\nReview thread: <#9002>'
		});
	});
});
