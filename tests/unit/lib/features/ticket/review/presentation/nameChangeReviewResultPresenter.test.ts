import { NameChangeRequestStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
	getNameChangeEditFailureMessage,
	getNameChangeReviewFailureMessage,
	getReviewedNameChangeMetadata
} from '../../../../../../../src/lib/features/ticket/review/presentation/nameChangeReviewResultPresenter';

describe('nameChangeReviewResultPresenter', () => {
	it('maps forbidden edit failures to a staff-only response', () => {
		expect(
			getNameChangeEditFailureMessage({
				kind: 'forbidden'
			})
		).toEqual({
			content: 'Only staff members can review name change requests.'
		});
	});

	it('maps already-reviewed edit failures to a plain response', () => {
		expect(
			getNameChangeEditFailureMessage({
				kind: 'already_reviewed'
			})
		).toEqual({
			content: 'This request has already been reviewed.'
		});
	});

	it('maps requester-member review failures to request-id aware responses', () => {
		expect(
			getNameChangeReviewFailureMessage({
				kind: 'requester_member_not_found'
			})
		).toEqual({
			content: 'Could not resolve requester member for validation. Please contact TECH with:',
			requestId: true
		});
	});

	it('maps the remaining review failures to the expected response shape', () => {
		expect(
			getNameChangeReviewFailureMessage({
				kind: 'forbidden'
			})
		).toEqual({
			content: 'Only staff members can review name change requests.'
		});

		expect(
			getNameChangeReviewFailureMessage({
				kind: 'reviewer_not_found'
			})
		).toEqual({
			content: 'Could not resolve your database user. Please contact TECH with:',
			requestId: true
		});

		expect(
			getNameChangeReviewFailureMessage({
				kind: 'already_reviewed'
			})
		).toEqual({
			content: 'This request has already been reviewed.'
		});

		expect(
			getNameChangeReviewFailureMessage({
				kind: 'validation_failed'
			})
		).toEqual({
			content: 'Could not validate the requested name. Please contact TECH with:',
			requestId: true
		});

		expect(
			getNameChangeReviewFailureMessage({
				kind: 'nickname_too_long'
			})
		).toEqual({
			content:
				'Cannot approve this request because the resulting nickname would exceed Discord limits after organization formatting/rank is applied. Ask the requester for a shorter name.'
		});
	});

	it('builds reviewed metadata from the persisted status', () => {
		expect(getReviewedNameChangeMetadata(NameChangeRequestStatus.APPROVED)).toEqual({
			reviewStatusLabel: 'Approved',
			decisionVerb: 'approved'
		});

		expect(getReviewedNameChangeMetadata(NameChangeRequestStatus.DENIED)).toEqual({
			reviewStatusLabel: 'Denied',
			decisionVerb: 'denied'
		});
	});
});
