import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { createInteractionResponder } from '../../../../src/lib/discord/interactions/interactionResponder';

describe('interactionResponder', () => {
	it('routes automatic failures to reply before any defer', async () => {
		const interaction = createMockInteraction();
		const responder = createInteractionResponder({
			interaction,
			context: {
				requestId: 'req-1',
				logger: createMockLogger()
			},
			logger: createMockLogger(),
			caller: 'test'
		});

		await responder.fail('Something failed.', {
			requestId: true
		});

		expect(interaction.reply).toHaveBeenCalledWith({
			content: 'Something failed. requestId=`req-1`',
			flags: MessageFlags.Ephemeral
		});
		expect(interaction.editReply).not.toHaveBeenCalled();
		expect(interaction.followUp).not.toHaveBeenCalled();
	});

	it('routes automatic failures to editReply after deferReply', async () => {
		const interaction = createMockInteraction();
		const responder = createInteractionResponder({
			interaction,
			context: {
				requestId: 'req-2',
				logger: createMockLogger()
			},
			logger: createMockLogger(),
			caller: 'test'
		});

		await responder.deferEphemeralReply();
		await responder.fail('Deferred failure');

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: MessageFlags.Ephemeral
		});
		expect(interaction.editReply).toHaveBeenCalledWith(
			expect.objectContaining({
				content: 'Deferred failure'
			})
		);
		expect(interaction.followUp).not.toHaveBeenCalled();
	});

	it('routes automatic failures to followUp after deferUpdate', async () => {
		const interaction = createMockInteraction({
			deferUpdate: vi.fn(async () => undefined)
		});
		const responder = createInteractionResponder({
			interaction,
			context: {
				requestId: 'req-3',
				logger: createMockLogger()
			},
			logger: createMockLogger(),
			caller: 'test'
		});

		await responder.deferUpdate();
		await responder.fail('Update failure');

		expect(interaction.followUp).toHaveBeenCalledWith({
			content: 'Update failure',
			flags: MessageFlags.Ephemeral
		});
		expect(interaction.reply).not.toHaveBeenCalled();
		expect(interaction.editReply).not.toHaveBeenCalled();
	});

	it('swallows followUp send errors in safe helpers', async () => {
		const logger = createMockLogger();
		const interaction = createMockInteraction({
			followUp: vi.fn(async () => {
				throw new Error('nope');
			})
		});
		const responder = createInteractionResponder({
			interaction,
			context: {
				requestId: 'req-4',
				logger
			},
			logger,
			caller: 'test'
		});

		await expect(
			responder.safeFollowUp({
				content: 'Will fail',
				flags: MessageFlags.Ephemeral
			})
		).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				errorMessage: 'nope',
				errorName: 'Error',
				caller: 'test'
			}),
			'discord.side_effect.failed'
		);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('leaves the raw error, and its request body, out of the log when logRawError is false', async () => {
		const logger = createMockLogger();
		const apiError = Object.assign(new Error('Unknown interaction'), {
			code: '10062',
			requestBody: { files: [{ name: 'report.csv', data: 'secret nickname' }], json: { content: 'secret nickname' } }
		});
		const interaction = createMockInteraction({
			editReply: vi.fn(async () => {
				throw apiError;
			})
		});
		const responder = createInteractionResponder({ interaction, context: { requestId: 'req-5', logger }, logger, caller: 'test' });

		await responder.safeEditReply({ content: 'secret nickname' }, { logRawError: false });
		await responder.safeEditReply({ content: 'other' });

		const [sanitized] = logger.error.mock.calls[0];
		expect(sanitized).toEqual({ errorMessage: 'Unknown interaction', errorName: 'Error', errorCode: '10062', caller: 'test' });
		expect(JSON.stringify(sanitized)).not.toContain('secret');
		expect(logger.error.mock.calls[1][0]).toMatchObject({ err: apiError });
	});
});

function createMockInteraction(overrides: Partial<ReturnType<typeof baseInteraction>> = {}) {
	return {
		...baseInteraction(),
		...overrides
	};
}

function baseInteraction() {
	return {
		deferred: false,
		replied: false,
		reply: vi.fn(async () => undefined),
		editReply: vi.fn(async () => undefined),
		followUp: vi.fn(async () => undefined),
		deferReply: vi.fn(async () => undefined),
		deferUpdate: vi.fn(async () => undefined)
	};
}

function createMockLogger() {
	return {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: vi.fn(function child() {
			return this;
		})
	};
}

describe('interactionResponder files', () => {
	it('forwards files to reply, editReply and followUp', async () => {
		const interaction = createMockInteraction();
		const responder = createInteractionResponder({
			interaction,
			context: {
				requestId: 'req-files',
				logger: createMockLogger()
			},
			logger: createMockLogger(),
			caller: 'test'
		});
		const files = [{ attachment: Buffer.from('a,b\r\n'), name: 'report.csv' }];

		await responder.safeReply({ content: 'reply', files });
		await responder.safeEditReply({ content: 'edit', files });
		await responder.safeFollowUp({ content: 'follow', files });

		expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'reply', files }));
		expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: 'edit', files }));
		expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: 'follow', files }));
	});
});
