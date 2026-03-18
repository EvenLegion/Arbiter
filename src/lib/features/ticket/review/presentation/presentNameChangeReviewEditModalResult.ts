import type { EditPendingNameChangeRequestResult } from '../../../../services/name-change/nameChangeService';

type NameChangeReviewEditModalPresentation =
	| {
			kind: 'response';
			delivery: 'fail' | 'editReply';
			content: string;
			requestId?: boolean;
	  }
	| {
			kind: 'edited';
			threadSync: {
				requestId: number;
				previousRequestedName: string;
				requestedName: string;
			};
	  };

export function presentNameChangeReviewEditModalResult(result: EditPendingNameChangeRequestResult): NameChangeReviewEditModalPresentation {
	switch (result.kind) {
		case 'forbidden':
			return {
				kind: 'response',
				delivery: 'fail',
				content: 'Only staff members can edit name change requests.'
			};
		case 'not_found':
		case 'already_reviewed':
			return {
				kind: 'response',
				delivery: 'fail',
				content: 'This request has already been reviewed.'
			};
		case 'invalid_requested_name':
			return {
				kind: 'response',
				delivery: 'editReply',
				content: result.errorMessage
			};
		case 'requester_member_not_found':
			return {
				kind: 'response',
				delivery: 'fail',
				content: 'Could not resolve requester member for validation. Please contact TECH with:',
				requestId: true
			};
		case 'nickname_too_long':
			return {
				kind: 'response',
				delivery: 'editReply',
				content: 'Edited requested name is too long after organization formatting/rank is applied. Please choose a shorter name.'
			};
		case 'validation_failed':
			return {
				kind: 'response',
				delivery: 'fail',
				content: 'Could not validate edited requested name. Please contact TECH with:',
				requestId: true
			};
		case 'edited':
			return {
				kind: 'edited',
				threadSync: {
					requestId: result.requestId,
					previousRequestedName: result.previousRequestedName,
					requestedName: result.requestedName
				}
			};
	}
}
