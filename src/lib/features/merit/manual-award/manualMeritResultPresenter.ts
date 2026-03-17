import type { AwardManualMeritWorkflowResult } from '../../../services/manual-merit/manualMeritService';
import { buildManualMeritAwardReply } from '../presentation/buildManualMeritAwardReply';

type ManualMeritResponse =
	| {
			delivery: 'fail';
			content: string;
			requestId?: boolean;
	  }
	| {
			delivery: 'editReply';
			content: string;
	  };

export function presentManualMeritResult(result: AwardManualMeritWorkflowResult): ManualMeritResponse {
	switch (result.kind) {
		case 'forbidden':
			return {
				delivery: 'fail',
				content: 'Only staff can use this command.'
			};
		case 'invalid_player_selection':
			return {
				delivery: 'editReply',
				content: 'Invalid player selection. Please use the autocomplete options.'
			};
		case 'invalid_merit_type':
			return {
				delivery: 'editReply',
				content: 'Invalid merit type. Please select one of the provided options.'
			};
		case 'target_not_found':
			return {
				delivery: 'editReply',
				content: 'Selected player was not found. Please use the autocomplete options.'
			};
		case 'awarder_not_found':
			return {
				delivery: 'fail',
				content: 'Could not resolve your member record. Please contact TECH with:',
				requestId: true
			};
		case 'linked_event_not_found':
			return {
				delivery: 'editReply',
				content: 'Selected event was not found.'
			};
		case 'linked_event_too_old':
			return {
				delivery: 'editReply',
				content: 'Selected event is older than 5 days and cannot be linked for this command.'
			};
		case 'merit_type_not_manual_awardable':
			return {
				delivery: 'editReply',
				content: 'Selected merit type can only be awarded through event finalization.'
			};
		case 'awarded':
			return {
				delivery: 'editReply',
				content: buildManualMeritAwardReply(result)
			};
	}
}
