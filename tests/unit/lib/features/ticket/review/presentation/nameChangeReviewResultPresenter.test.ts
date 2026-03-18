import { NameChangeRequestStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
	getNameChangeEditFailureMessage,
	getNameChangeReviewFailureMessage,
	getReviewedNameChangeMetadata
} from '../../../../../../../src/lib/features/ticket/review/presentation/nameChangeReviewResultPresenter';

describe('nameChangeReviewResultPresenter', () => {
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

	it('builds reviewed metadata from the persisted status', () => {
		expect(getReviewedNameChangeMetadata(NameChangeRequestStatus.APPROVED)).toEqual({
			reviewStatusLabel: 'Approved',
			decisionVerb: 'approved'
		});
	});
});
