import { NameChangeRequestStatus } from '@prisma/client';

import type { GetPendingNameChangeRequestForEditResult, ReviewNameChangeDecisionResult } from '../../../../services/name-change/nameChangeService';

export function getNameChangeEditFailureMessage(result: Exclude<GetPendingNameChangeRequestForEditResult, { kind: 'editable' }>) {
	if (result.kind === 'forbidden') {
		return {
			content: 'Only staff members can review name change requests.'
		};
	}

	return {
		content: 'This request has already been reviewed.'
	};
}

export function getNameChangeReviewFailureMessage(
	result: Exclude<ReviewNameChangeDecisionResult, { kind: 'reviewed' } | { kind: 'reviewed_sync_failed' }>
) {
	switch (result.kind) {
		case 'forbidden':
			return {
				content: 'Only staff members can review name change requests.'
			};
		case 'reviewer_not_found':
			return {
				content: 'Could not resolve your database user. Please contact TECH with:',
				requestId: true
			};
		case 'already_reviewed':
			return {
				content: 'This request has already been reviewed.'
			};
		case 'requester_member_not_found':
			return {
				content: 'Could not resolve requester member for validation. Please contact TECH with:',
				requestId: true
			};
		case 'validation_failed':
			return {
				content: 'Could not validate the requested name. Please contact TECH with:',
				requestId: true
			};
		case 'nickname_too_long':
			return {
				content:
					'Cannot approve this request because the resulting nickname would exceed Discord limits after organization formatting/rank is applied. Ask the requester for a shorter name.'
			};
	}
}

export function getReviewedNameChangeMetadata(status: NameChangeRequestStatus) {
	return {
		reviewStatusLabel: status === NameChangeRequestStatus.APPROVED ? 'Approved' : 'Denied',
		decisionVerb: status === NameChangeRequestStatus.APPROVED ? 'approved' : 'denied'
	};
}
