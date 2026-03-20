import { describe, expect, it, vi } from 'vitest';

import { syncEditedNameChangeThread } from '../../../../../../src/lib/features/ticket/thread/syncEditedNameChangeThread';

describe('syncEditedNameChangeThread', () => {
	it('updates the review message and posts a sanitized audit note to the thread', async () => {
		const message = {
			embeds: [
				{
					title: 'Name Change Request',
					fields: [
						{
							name: 'Requested Name',
							value: 'Old Name',
							inline: false
						}
					]
				}
			],
			edit: vi.fn().mockResolvedValue(undefined)
		};
		const channel = {
			send: vi.fn().mockResolvedValue(undefined)
		};
		const logger = createLogger();

		await syncEditedNameChangeThread({
			message,
			channel,
			channelId: 'thread-1',
			requestId: 41,
			previousRequestedName: `  ${'A'.repeat(120)}  `,
			requestedName: `  ${'B'.repeat(120)}  `,
			reviewerDiscordUserId: 'staff-1',
			logger
		});

		expect(message.edit).toHaveBeenCalledTimes(1);
		const editPayload = message.edit.mock.calls[0][0];
		expect(editPayload.components).toHaveLength(1);
		expect(editPayload.embeds[0].data.fields.find((field: { name: string }) => field.name === 'Requested Name')?.value).toBe(
			`${'B'.repeat(97)}...`
		);
		expect(channel.send).toHaveBeenCalledWith({
			content: `<@staff-1> updated requested name from **${'A'.repeat(97)}...** to **${'B'.repeat(97)}...**.`,
			allowedMentions: {
				parse: []
			}
		});
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('does nothing beyond the message update when no sendable thread channel is available', async () => {
		const message = {
			embeds: [],
			edit: vi.fn().mockResolvedValue(undefined)
		};
		const logger = createLogger();

		await syncEditedNameChangeThread({
			message,
			channel: {},
			channelId: null,
			requestId: 42,
			previousRequestedName: 'Old Name',
			requestedName: 'New Name',
			reviewerDiscordUserId: 'staff-2',
			logger
		});

		expect(message.edit).toHaveBeenCalledTimes(1);
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('logs edit and thread-post failures without throwing', async () => {
		const editError = new Error('edit failed');
		const sendError = new Error('send failed');
		const message = {
			embeds: [],
			edit: vi.fn().mockRejectedValue(editError)
		};
		const channel = {
			send: vi.fn().mockRejectedValue(sendError)
		};
		const logger = createLogger();

		await syncEditedNameChangeThread({
			message,
			channel,
			channelId: 'thread-3',
			requestId: 43,
			previousRequestedName: 'Old Name',
			requestedName: 'New Name',
			reviewerDiscordUserId: 'staff-3',
			logger
		});

		expect(logger.error).toHaveBeenCalledWith(
			{
				err: editError,
				nameChangeRequestId: 43
			},
			'Failed to update name change review message after requested name edit'
		);
		expect(logger.warn).toHaveBeenCalledWith(
			{
				err: sendError,
				channelId: 'thread-3'
			},
			'Failed to post requested-name edit message in thread'
		);
	});
});

function createLogger() {
	return {
		error: vi.fn(),
		warn: vi.fn()
	};
}
