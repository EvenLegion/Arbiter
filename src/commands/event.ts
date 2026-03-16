import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';

import { ENV_DISCORD } from '../config/env';
import { handleEventAutocomplete } from '../lib/features/event-merit/session/eventAutocompleteProvider';
import { handleEventAddVc } from '../lib/features/event-merit/session/handleEventAddVc';
import { handleEventStart } from '../lib/features/event-merit/session/handleEventStart';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Subcommand.Options>({
	description: 'Event commands',
	preconditions: ['GuildOnly', 'EventOperatorOnly'],
	subcommands: [
		{
			name: 'start',
			chatInputRun: 'chatInputStartEvent'
		},
		{
			name: 'add_vc',
			chatInputRun: 'chatInputAddVc'
		}
	]
})
export class EventCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName('event')
					.setDescription('Event commands.')
					.addSubcommand((subcommand) =>
						subcommand
							.setName('start')
							.setDescription('Create an event draft for your current voice channel.')
							.addStringOption((option) =>
								option.setName('tier_level').setDescription('Event tier level.').setRequired(true).setAutocomplete(true)
							)
							.addStringOption((option) =>
								option
									.setName('event_name')
									.setDescription('Event name shown in tracking and review flows.')
									.setRequired(true)
									.setMinLength(3)
									.setMaxLength(100)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName('add_vc')
							.setDescription('Add a voice channel as a child VC to a draft or active event.')
							.addStringOption((option) =>
								option
									.setName('event_selection')
									.setDescription('Select a draft or active event.')
									.setRequired(true)
									.setAutocomplete(true)
							)
							.addStringOption((option) =>
								option
									.setName('voice_channel')
									.setDescription('Voice channel to add. If omitted, your current voice channel is used.')
									.setRequired(false)
									.setAutocomplete(true)
							)
							.addStringOption((option) =>
								option
									.setName('rename_channel_to')
									.setDescription('Name for the added voice channel, if not provided, channel can be renamed manually.')
									.setRequired(false)
									.setMinLength(1)
									.setMaxLength(100)
							)
					),
			{
				guildIds: [ENV_DISCORD.DISCORD_GUILD_ID]
			}
		);
	}

	public async chatInputStartEvent(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'event.start',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handleEventStart({
			interaction,
			context
		});
	}

	public async chatInputAddVc(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'event.addVc',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handleEventAddVc({
			interaction,
			context
		});
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		return handleEventAutocomplete({
			interaction,
			commandName: this.name
		});
	}
}
