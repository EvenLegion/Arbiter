import { SlashCommandBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/features/event-merit/session/draft/handleEventStart', () => ({ handleEventStart: vi.fn() }));
vi.mock('../../../src/lib/features/event-merit/session/add-vc/handleEventAddVc', () => ({ handleEventAddVc: vi.fn() }));
vi.mock('../../../src/lib/features/event-merit/session/autocomplete/eventAutocompleteProvider', () => ({ handleEventAutocomplete: vi.fn() }));

import { EventCommand } from '../../../src/commands/event';

describe('event command serialization', () => {
	it('serializes a required integer duration option with all five exact choices without registering with Discord', () => {
		const builder = new SlashCommandBuilder();
		const registerChatInputCommand = vi.fn((build: (builder: SlashCommandBuilder) => unknown) => build(builder));
		EventCommand.prototype.registerApplicationCommands.call({} as EventCommand, { registerChatInputCommand } as never);
		// Compare the outbound JSON body, excluding the builder's optional undefined properties.
		const command = JSON.parse(JSON.stringify(builder.toJSON())) as ReturnType<SlashCommandBuilder['toJSON']>;
		const start = command.options?.find((option) => option.name === 'start');
		expect(start).toMatchObject({
			options: expect.arrayContaining([
				expect.objectContaining({
					name: 'expected_event_duration',
					type: 4,
					required: true,
					choices: [
						{ name: '1 hour', value: 60 },
						{ name: '1.5 hours', value: 90 },
						{ name: '2 hours', value: 120 },
						{ name: '2.5 hours', value: 150 },
						{ name: '3 hours', value: 180 }
					]
				})
			])
		});
	});
});
