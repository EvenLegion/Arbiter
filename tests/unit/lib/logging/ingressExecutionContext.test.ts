import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const child = vi.fn((bindings: Record<string, unknown>) => ({
		bindings,
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: vi.fn(function nestedChild(this: unknown) {
			return this;
		})
	}));

	return {
		child
	};
});

vi.mock('../../../../src/integrations/pino', () => ({
	PINO_LOGGER: {
		child: mocks.child
	}
}));

import { createAutocompleteExecutionContext, createCommandExecutionContext } from '../../../../src/lib/logging/ingressExecutionContext';

describe('ingressExecutionContext', () => {
	beforeEach(() => {
		mocks.child.mockClear();
	});

	it('uses the Discord interaction id as the command request id and binds command metadata', () => {
		const context = createCommandExecutionContext({
			interaction: {
				id: 'interaction-1',
				user: {
					id: 'user-1'
				},
				guildId: 'guild-1',
				channelId: 'channel-1',
				commandName: 'staff',
				options: {
					getSubcommandGroup: vi.fn(() => 'division_membership'),
					getSubcommand: vi.fn(() => 'add')
				}
			} as never,
			flow: 'staff.divisionMembership.add'
		});

		expect(context.requestId).toBe('interaction-1');
		expect(mocks.child).toHaveBeenCalledWith(
			expect.objectContaining({
				requestId: 'interaction-1',
				transport: 'chat_input',
				discordInteractionId: 'interaction-1',
				discordUserId: 'user-1',
				guildId: 'guild-1',
				channelId: 'channel-1',
				commandName: 'staff',
				subcommandGroupName: 'division_membership',
				subcommandName: 'add'
			})
		);
	});

	it('binds autocomplete request metadata and focused option details', () => {
		const context = createAutocompleteExecutionContext({
			interaction: {
				id: 'interaction-2',
				user: {
					id: 'user-2'
				},
				guildId: 'guild-2',
				channelId: 'channel-2',
				options: {
					getFocused: vi.fn(() => ({
						name: 'tier_level',
						value: '3'
					})),
					getSubcommandGroup: vi.fn(() => null),
					getSubcommand: vi.fn(() => 'start')
				}
			} as never,
			commandName: 'event'
		});

		expect(context.requestId).toBe('interaction-2');
		expect(mocks.child).toHaveBeenCalledWith(
			expect.objectContaining({
				requestId: 'interaction-2',
				transport: 'autocomplete',
				discordInteractionId: 'interaction-2',
				discordUserId: 'user-2',
				commandName: 'event',
				subcommandName: 'start',
				focusedOptionName: 'tier_level'
			})
		);
	});
});
