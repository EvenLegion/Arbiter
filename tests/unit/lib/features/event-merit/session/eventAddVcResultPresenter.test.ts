import { EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { presentEventAddVcResult } from '../../../../../../src/lib/features/event-merit/session/add-vc/eventAddVcResultPresenter';

describe('eventAddVcResultPresenter', () => {
	it('maps failure and duplicate outcomes to clear inline replies', () => {
		expect(
			presentEventAddVcResult({
				kind: 'actor_not_found'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Could not resolve your database user.'
		});

		expect(
			presentEventAddVcResult({
				kind: 'event_not_found'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Selected event must be in draft or active state.'
		});

		expect(
			presentEventAddVcResult({
				kind: 'invalid_state',
				currentState: EventSessionState.CANCELLED
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Selected event must be in draft or active state.'
		});

		expect(
			presentEventAddVcResult({
				kind: 'parent_channel_already_tracked',
				channelId: 'vc-1',
				eventName: 'Weekly Op'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Channel <#vc-1> is already the Main channel for event **Weekly Op**.'
		});

		expect(
			presentEventAddVcResult({
				kind: 'already_tracked',
				channelId: 'vc-2',
				eventName: 'Weekly Op'
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Channel <#vc-2> is already tracked for event **Weekly Op**.'
		});
	});

	it('includes reservation details when another event already owns the channel', () => {
		expect(
			presentEventAddVcResult({
				kind: 'channel_reserved',
				channelId: 'vc-3',
				eventSessionId: 19,
				eventName: 'Alpha Op',
				state: EventSessionState.ACTIVE
			})
		).toEqual({
			delivery: 'editReply',
			content: 'Channel <#vc-3> is already reserved by event **Alpha Op** (#19, Active).'
		});
	});

	it('deletes the ephemeral reply only when the success announcement completed everywhere', () => {
		expect(
			presentEventAddVcResult({
				kind: 'channel_added',
				channelId: 'vc-4',
				eventName: 'Alpha Op',
				parentVoiceChannelId: 'parent-1',
				announcementComplete: true
			})
		).toEqual({
			delivery: 'deleteReply'
		});

		expect(
			presentEventAddVcResult({
				kind: 'channel_added',
				channelId: 'vc-4',
				eventName: 'Alpha Op',
				parentVoiceChannelId: 'parent-1',
				announcementComplete: false
			})
		).toEqual({
			delivery: 'editReply',
			content:
				'Event channel was added, but I could not post the success message in both Main channel and sub channel chats. Check bot permissions.'
		});
	});
});
