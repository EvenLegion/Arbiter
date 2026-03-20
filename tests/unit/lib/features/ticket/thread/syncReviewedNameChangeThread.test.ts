import { describe, expect, it, vi } from 'vitest';

import { syncReviewedNameChangeThread } from '../../../../../../src/lib/features/ticket/thread/syncReviewedNameChangeThread';

describe('syncReviewedNameChangeThread', () => {
	it('updates the review message, notifies the requester, and archives the thread', async () => {
		const message = {
			embeds: [
				{
					title: 'Name Change Request',
					fields: [
						{
							name: 'Status',
							value: 'Pending',
							inline: true
						}
					]
				}
			],
			edit: vi.fn().mockResolvedValue(undefined)
		};
		const channel = {
			send: vi.fn().mockResolvedValue(undefined),
			archived: false,
			setArchived: vi.fn().mockResolvedValue(undefined)
		};
		const logger = createLogger();

		await syncReviewedNameChangeThread({
			message,
			channel,
			channelId: 'thread-1',
			requestId: 50,
			requesterDiscordUserId: 'requester-1',
			reviewerDiscordUserId: 'staff-1',
			reviewerTag: 'staff#0001',
			statusLabel: 'Approved',
			decisionVerb: 'approved',
			logger
		});

		expect(message.edit).toHaveBeenCalledTimes(1);
		const editPayload = message.edit.mock.calls[0][0];
		expect(editPayload.components).toHaveLength(1);
		expect(editPayload.components[0].components.every((component: { data: { disabled?: boolean } }) => component.data.disabled)).toBe(true);
		expect(editPayload.embeds[0].data.fields.find((field: { name: string }) => field.name === 'Status')?.value).toBe('Approved');
		expect(channel.send).toHaveBeenCalledWith({
			content: '<@requester-1>, your request was approved by <@staff-1>.'
		});
		expect(channel.setArchived).toHaveBeenCalledWith(true, 'Name change request approved by staff#0001');
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('skips thread-specific follow-up when the provided channel cannot send or archive', async () => {
		const message = {
			embeds: [],
			edit: vi.fn().mockResolvedValue(undefined)
		};
		const logger = createLogger();

		await syncReviewedNameChangeThread({
			message,
			channel: {},
			channelId: null,
			requestId: 51,
			requesterDiscordUserId: 'requester-2',
			reviewerDiscordUserId: 'staff-2',
			reviewerTag: 'staff#0002',
			statusLabel: 'Denied',
			decisionVerb: 'denied',
			logger
		});

		expect(message.edit).toHaveBeenCalledTimes(1);
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('logs edit, notification, and archive failures without interrupting the workflow', async () => {
		const editError = new Error('edit failed');
		const sendError = new Error('send failed');
		const archiveError = new Error('archive failed');
		const message = {
			embeds: [],
			edit: vi.fn().mockRejectedValue(editError)
		};
		const channel = {
			send: vi.fn().mockRejectedValue(sendError),
			archived: false,
			setArchived: vi.fn().mockRejectedValue(archiveError)
		};
		const logger = createLogger();

		await syncReviewedNameChangeThread({
			message,
			channel,
			channelId: 'thread-3',
			requestId: 52,
			requesterDiscordUserId: 'requester-3',
			reviewerDiscordUserId: 'staff-3',
			reviewerTag: 'staff#0003',
			statusLabel: 'Approved',
			decisionVerb: 'approved',
			logger
		});

		expect(logger.error).toHaveBeenCalledWith(
			{
				err: editError
			},
			'Failed to update name change review message after decision'
		);
		expect(logger.warn).toHaveBeenCalledWith(
			{
				err: sendError,
				channelId: 'thread-3'
			},
			'Failed to post name change review outcome message in thread'
		);
		expect(logger.warn).toHaveBeenCalledWith(
			{
				err: archiveError,
				channelId: 'thread-3',
				nameChangeRequestId: 52
			},
			'Failed to archive reviewed name change request thread'
		);
	});
});

function createLogger() {
	return {
		error: vi.fn(),
		warn: vi.fn()
	};
}
