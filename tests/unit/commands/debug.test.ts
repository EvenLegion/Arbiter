import { SlashCommandBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ handle: vi.fn(), context: vi.fn(() => ({ requestId: 'test' })) }));
vi.mock('../../../src/config/env', () => ({ ENV_DISCORD: { DISCORD_GUILD_ID: 'configured' } }));
vi.mock('../../../src/lib/features/debug/handleRecoverIaeEvent', () => ({ handleRecoverIaeEvent: mocks.handle }));
vi.mock('../../../src/lib/logging/commandExecutionContext', () => ({ createCommandExecutionContext: mocks.context }));
import { DebugCommand } from '../../../src/commands/debug';

describe('temporary debug recovery command', () => {
	it('registers only the fixed recovery subcommand with an optional apply boolean in the configured guild', () => {
		const builder = new SlashCommandBuilder();
		const registerChatInputCommand = vi.fn((build: (builder: SlashCommandBuilder) => unknown) => build(builder));
		DebugCommand.prototype.registerApplicationCommands.call({} as DebugCommand, { registerChatInputCommand } as never);
		const json = JSON.parse(JSON.stringify(builder.toJSON()));
		expect(json.name).toBe('debug');
		expect(json.options).toHaveLength(1);
		expect(json.options[0].name).toBe('recover_iae_event');
		expect(json.options[0].options).toEqual([{ type: 5, name: 'apply', description: expect.any(String), required: false }]);
		expect(registerChatInputCommand).toHaveBeenCalledWith(expect.any(Function), { guildIds: ['configured'] });
	});
	it('routes the interaction to the bounded handler', async () => {
		const interaction = {} as never;
		await DebugCommand.prototype.chatInputRecoverIaeEvent.call({} as DebugCommand, interaction);
		expect(mocks.context).toHaveBeenCalledWith({ interaction, flow: 'debug.recoverIaeEvent' });
		expect(mocks.handle).toHaveBeenCalledWith({ interaction, context: { requestId: 'test' } });
	});
});
