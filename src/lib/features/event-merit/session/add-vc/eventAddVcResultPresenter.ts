import type { AddTrackedChannelResult } from '../../../../services/event-lifecycle/eventLifecycleService';
import { formatEventSessionStateLabel } from '../../presentation/shared/formatEventSessionStateLabel';

type EventAddVcResponse =
	| {
			delivery: 'editReply';
			content: string;
	  }
	| {
			delivery: 'deleteReply';
	  };

export function presentEventAddVcResult(result: AddTrackedChannelResult): EventAddVcResponse {
	switch (result.kind) {
		case 'actor_not_found':
			return {
				delivery: 'editReply',
				content: 'Could not resolve your database user.'
			};
		case 'event_not_found':
		case 'invalid_state':
			return {
				delivery: 'editReply',
				content: 'Selected event must be in draft or active state.'
			};
		case 'parent_channel_already_tracked':
			return {
				delivery: 'editReply',
				content: `Channel <#${result.channelId}> is already the Main channel for event **${result.eventName}**.`
			};
		case 'channel_reserved':
			return {
				delivery: 'editReply',
				content: `Channel <#${result.channelId}> is already reserved by event **${result.eventName}** (#${result.eventSessionId}, ${formatEventSessionStateLabel(result.state)}).`
			};
		case 'already_tracked':
			return {
				delivery: 'editReply',
				content: `Channel <#${result.channelId}> is already tracked for event **${result.eventName}**.`
			};
		case 'channel_added':
			return result.announcementComplete
				? {
						delivery: 'deleteReply'
					}
				: {
						delivery: 'editReply',
						content:
							'Event channel was added, but I could not post the success message in both Main channel and sub channel chats. Check bot permissions.'
					};
	}
}
