import { describe, expect, it, vi } from 'vitest';

import { UserEvent } from '../../../src/listeners/commands/chatInputCommands/chatInputCommandError';

describe('chatInputCommandError listener', () => {
	it('routes unexpected failures through the shared responder', async () => {
		const interaction = createInteraction();
		const listener = Object.create(UserEvent.prototype) as UserEvent;

		await listener.run(new Error('boom'), {
			interaction,
			command: {
				name: 'test'
			}
		} as never);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: expect.stringContaining('An unexpected error occurred. requestId=`'),
			flags: expect.any(Number)
		});
	});
});

function createInteraction() {
	return {
		id: 'interaction-1',
		user: {
			id: 'user-1'
		},
		deferred: false,
		replied: false,
		reply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
		followUp: vi.fn().mockResolvedValue(undefined),
		deferReply: vi.fn().mockResolvedValue(undefined)
	} as never;
}
