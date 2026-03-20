import type { CreateEventDraftResult } from '../../../../services/event-lifecycle';

type EventStartResponse =
	| {
			delivery: 'fail';
			content: string;
			requestId?: boolean;
	  }
	| {
			delivery: 'editReply';
			content: string;
	  }
	| {
			delivery: 'deleteReply';
	  };

export function presentEventStartResult(result: CreateEventDraftResult): EventStartResponse {
	switch (result.kind) {
		case 'tier_not_found':
			return {
				delivery: 'editReply',
				content: 'Selected event tier is not available.'
			};
		case 'tracking_thread_failed':
			return {
				delivery: 'fail',
				content: 'Failed to create the event tracking thread. Please contact a TECH member with the following:',
				requestId: true
			};
		case 'draft_created':
			return {
				delivery: 'deleteReply'
			};
	}
}
