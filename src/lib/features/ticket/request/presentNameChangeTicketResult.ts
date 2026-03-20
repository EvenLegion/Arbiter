import type { SubmitNameChangeRequestResult } from '../../../services/name-change/nameChangeService';

type NameChangeTicketResponse =
	| {
			delivery: 'fail';
			content: string;
			requestId?: boolean;
	  }
	| {
			delivery: 'editReply';
			content: string;
	  };

export function presentNameChangeTicketResult(result: SubmitNameChangeRequestResult): NameChangeTicketResponse {
	switch (result.kind) {
		case 'requester_not_found':
			return {
				delivery: 'fail',
				content: 'User not found in database. Please contact staff with:',
				requestId: true
			};
		case 'invalid_requested_name':
			return {
				delivery: 'editReply',
				content: result.errorMessage
			};
		case 'requester_member_not_found':
			return {
				delivery: 'fail',
				content: 'Could not resolve your member record. Please contact staff with:',
				requestId: true
			};
		case 'nickname_too_long':
			return {
				delivery: 'editReply',
				content:
					'Requested name is too long after organization formatting/rank is applied. Please submit a shorter name that fits Discord nickname limits.'
			};
		case 'validation_failed':
			return {
				delivery: 'fail',
				content: 'Could not validate requested name. Please contact staff with:',
				requestId: true
			};
		case 'request_creation_failed':
			return {
				delivery: 'fail',
				content: 'Failed to create name change request. Please contact staff with:',
				requestId: true
			};
		case 'review_thread_failed':
			return {
				delivery: 'editReply',
				content: `Request created but failed to create review thread. Please contact staff with: requestId=${result.requestId}`
			};
		case 'review_thread_reference_failed':
			return {
				delivery: 'editReply',
				content: `Name change request thread was created, but I could not persist its review reference. Please contact staff with: requestId=${result.requestId}`
			};
		case 'created':
			return {
				delivery: 'editReply',
				content: `Name change request created.\nReview thread: <#${result.reviewThreadId}>${
					result.strippedDivisionPrefix ? '\nNote: I removed your division prefix from the requested name.' : ''
				}`
			};
	}
}
