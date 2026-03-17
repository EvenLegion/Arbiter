import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { createInteractionResponder } from '../../../../src/lib/discord/interactionResponder';

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
		const interaction = createMockInteraction({
			followUp: vi.fn(async () => {
				throw new Error('nope');
			})
		});
		const responder = createInteractionResponder({
			interaction,
			context: {
				requestId: 'req-4',
				logger: createMockLogger()
			},
			logger: createMockLogger(),
			caller: 'test'
		});

		await expect(
			responder.safeFollowUp({
				content: 'Will fail',
				flags: MessageFlags.Ephemeral
			})
		).resolves.toBeUndefined();
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
