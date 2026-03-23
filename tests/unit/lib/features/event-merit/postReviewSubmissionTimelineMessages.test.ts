import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resolveEventGuildChannel: vi.fn()
}));

vi.mock('../../../../../src/lib/features/event-merit/gateways/resolveEventChannels', () => ({
	resolveEventGuildChannel: mocks.resolveEventGuildChannel
}));

import { postReviewSubmissionTimelineMessages } from '../../../../../src/lib/features/event-merit/gateways/postReviewSubmissionTimelineMessages';

describe('postReviewSubmissionTimelineMessages', () => {
	beforeEach(() => {
		mocks.resolveEventGuildChannel.mockReset();
	});

	it('posts the host merit message to the event thread when review is submitted with merits', async () => {
		const threadSend = vi.fn().mockResolvedValue(undefined);
		const vcSend = vi.fn().mockResolvedValue(undefined);
		mocks.resolveEventGuildChannel.mockImplementation(async (_guild, channelId: string) => {
			if (channelId === 'thread-1') {
				return {
					send: threadSend
				};
			}

			return {
				send: vcSend
			};
		});

		await postReviewSubmissionTimelineMessages({
			guild: {
				id: 'guild-1'
			} as never,
			eventSession: {
				id: 10,
				name: 'Elite Op',
				threadId: 'thread-1',
				hostUser: {
					discordUserId: 'host-1'
				},
				channels: [
					{
						kind: 'PARENT_VC',
						channelId: 'vc-1'
					}
				]
			} as never,
			actorDiscordUserId: 'reviewer-1',
			mode: 'with',
			logger: {
				warn: vi.fn()
			} as never
		});

		expect(threadSend).toHaveBeenNthCalledWith(1, {
			content: 'Event review for **Elite Op** was submitted by <@reviewer-1> with **merits awarded**.'
		});
		expect(threadSend).toHaveBeenNthCalledWith(2, {
			content: '<@host-1> was awarded the **Centurion Host Merit**.'
		});
		expect(vcSend).toHaveBeenCalledTimes(1);
		expect(vcSend).toHaveBeenCalledWith({
			content: 'Event review for **Elite Op** was submitted by <@reviewer-1> with **merits awarded**.'
		});
	});
});
