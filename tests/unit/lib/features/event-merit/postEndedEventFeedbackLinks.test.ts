import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { postEndedEventFeedbackLinks } from '../../../../../src/lib/features/event-merit/gateways/postEndedEventFeedbackLinks';
import {
	resolveSendCapableVoiceChannel,
	sendMessageToChannel
} from '../../../../../src/lib/features/event-merit/presentation/eventDiscordMessageGateway';

vi.mock('../../../../../src/lib/features/event-merit/presentation/eventDiscordMessageGateway', () => ({
	resolveSendCapableVoiceChannel: vi.fn(),
	sendMessageToChannel: vi.fn()
}));

describe('postEndedEventFeedbackLinks', () => {
	it('posts the feedback form link to the parent and any available child voice channels', async () => {
		const logger = {
			warn: vi.fn()
		};

		vi.mocked(resolveSendCapableVoiceChannel).mockImplementation(async ({ channelId }: { channelId: string }) => {
			if (channelId === 'child-missing') {
				return null;
			}

			return {
				id: channelId,
				send: vi.fn()
			};
		});
		vi.mocked(sendMessageToChannel).mockResolvedValue(null);

		await postEndedEventFeedbackLinks({
			guild: {
				id: 'guild-1'
			} as never,
			eventSession: {
				id: 10,
				name: 'Worm Farm',
				state: EventSessionState.ENDED_PENDING_REVIEW,
				threadId: 'thread-10',
				channels: [
					{
						channelId: 'parent-1',
						kind: EventSessionChannelKind.PARENT_VC
					},
					{
						channelId: 'child-missing',
						kind: EventSessionChannelKind.CHILD_VC
					},
					{
						channelId: 'child-2',
						kind: EventSessionChannelKind.CHILD_VC
					}
				]
			} as never,
			logger: logger as never
		});

		expect(resolveSendCapableVoiceChannel).toHaveBeenCalledTimes(3);
		expect(sendMessageToChannel).toHaveBeenCalledTimes(2);
		expect(sendMessageToChannel).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				channel: expect.objectContaining({
					id: 'parent-1'
				}),
				payload: {
					content: [
						'Thank you for attending the event <:LgnSalute:lgn-salute-emoji-id>',
						'Please fill out [this form](https://docs.google.com/forms/d/e/1FAIpQLSfhVeowiJ9ZbvaPpFKwVRPW9NGorD2r_TFxbyyzEDCEBL3KpQ/viewform?usp=pp_url&entry.85184095=Worm+Farm) to provide feedback on the event'
					].join('\n')
				}
			})
		);
		expect(sendMessageToChannel).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				channel: expect.objectContaining({
					id: 'child-2'
				}),
				payload: {
					content: [
						'Thank you for attending the event <:LgnSalute:lgn-salute-emoji-id>',
						'Please fill out [this form](https://docs.google.com/forms/d/e/1FAIpQLSfhVeowiJ9ZbvaPpFKwVRPW9NGorD2r_TFxbyyzEDCEBL3KpQ/viewform?usp=pp_url&entry.85184095=Worm+Farm) to provide feedback on the event'
					].join('\n')
				}
			})
		);
		expect(logger.warn).toHaveBeenCalledWith(
			{
				eventSessionId: 10,
				channelId: 'child-missing'
			},
			'Skipped ended-event feedback link post for voice channel without send support'
		);
	});
});
