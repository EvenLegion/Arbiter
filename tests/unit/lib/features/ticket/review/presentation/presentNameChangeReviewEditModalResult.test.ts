import { describe, expect, it } from 'vitest';

import { presentNameChangeReviewEditModalResult } from '../../../../../../../src/lib/features/ticket/review/presentation/presentNameChangeReviewEditModalResult';

describe('presentNameChangeReviewEditModalResult', () => {
	it('maps staff-only and already-reviewed failures to fail responses', () => {
		expect(
			presentNameChangeReviewEditModalResult({
				kind: 'forbidden'
			})
		).toEqual({
			kind: 'response',
			delivery: 'fail',
			content: 'Only staff members can edit name change requests.'
		});

		expect(
			presentNameChangeReviewEditModalResult({
				kind: 'not_found'
			})
		).toEqual({
			kind: 'response',
			delivery: 'fail',
			content: 'This request has already been reviewed.'
		});

		expect(
			presentNameChangeReviewEditModalResult({
				kind: 'already_reviewed'
			})
		).toEqual({
			kind: 'response',
			delivery: 'fail',
			content: 'This request has already been reviewed.'
		});
	});

	it('maps validation and nickname failures to inline edit responses', () => {
		expect(
			presentNameChangeReviewEditModalResult({
				kind: 'invalid_requested_name',
				errorMessage: 'Requested name cannot contain brackets.'
			})
		).toEqual({
			kind: 'response',
			delivery: 'editReply',
			content: 'Requested name cannot contain brackets.'
		});

		expect(
			presentNameChangeReviewEditModalResult({
				kind: 'nickname_too_long'
			})
		).toEqual({
			kind: 'response',
			delivery: 'editReply',
			content: 'Edited requested name is too long after organization formatting/rank is applied. Please choose a shorter name.'
		});
	});

	it('maps requester lookup failures to request-id aware responses', () => {
		expect(
			presentNameChangeReviewEditModalResult({
				kind: 'requester_member_not_found'
			})
		).toEqual({
			kind: 'response',
			delivery: 'fail',
			content: 'Could not resolve requester member for validation. Please contact TECH with:',
			requestId: true
		});
	});

	it('maps validation failures to request-id aware failures', () => {
		expect(
			presentNameChangeReviewEditModalResult({
				kind: 'validation_failed'
			})
		).toEqual({
			kind: 'response',
			delivery: 'fail',
			content: 'Could not validate edited requested name. Please contact TECH with:',
			requestId: true
		});
	});

	it('maps edited results to thread-sync payloads', () => {
		expect(
			presentNameChangeReviewEditModalResult({
				kind: 'edited',
				requestId: 7,
				requesterDiscordUserId: 'user-1',
				previousRequestedName: 'Old',
				requestedName: 'New'
			})
		).toEqual({
			kind: 'edited',
			threadSync: {
				requestId: 7,
				previousRequestedName: 'Old',
				requestedName: 'New'
			}
		});
	});
});
