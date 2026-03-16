import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';

import { ENV_DISCORD } from '../config/env';
import { handleGiveMerit } from '../lib/features/merit/handleGiveMerit';
import { handleMeritAutocomplete } from '../lib/features/merit/meritAutocompleteProvider';
import { handleMeritList } from '../lib/features/merit/handleMeritList';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Subcommand.Options>({
	description: 'Merit commands',
	preconditions: ['GuildOnly'],
	subcommands: [
		{
			name: 'give',
			chatInputRun: 'chatInputGive'
		},
		{
			name: 'list',
			chatInputRun: 'chatInputList'
		}
	]
})
export class MeritCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName('merit')
					.setDescription('Merit commands.')
					.addSubcommand((subcommand) =>
						subcommand
							.setName('give')
							.setDescription('Award manual merits to a player (staff only).')
							.addStringOption((option) =>
								option.setName('player_name').setDescription('Player to award merits to.').setRequired(true).setAutocomplete(true)
							)
							.addStringOption((option) =>
								option.setName('merit_type').setDescription('Merit type to award.').setRequired(true).setAutocomplete(true)
							)
							.addStringOption((option) =>
								option
									.setName('reason')
									.setDescription('Optional reason for this manual merit award.')
									.setRequired(false)
									.setMinLength(1)
									.setMaxLength(100)
							)
							.addStringOption((option) =>
								option
									.setName('existing_event')
									.setDescription('Optional event from the last 5 days to link this award to.')
									.setRequired(false)
									.setAutocomplete(true)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName('list')
							.setDescription('List merit awards for yourself or another user (staff only).')
							.addStringOption((option) =>
								option
									.setName('user_name')
									.setDescription('User to list merits for (staff only).')
									.setRequired(false)
									.setAutocomplete(true)
							)
							.addBooleanOption((option) =>
								option
									.setName('private')
									.setDescription('Whether the response is private (staff only). Defaults to true.')
									.setRequired(false)
							)
					),
			{
				guildIds: [ENV_DISCORD.DISCORD_GUILD_ID]
			}
		);
	}

	public async chatInputList(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'merit.list',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handleMeritList({
			interaction,
			context
		});
	}

	public async chatInputGive(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'merit.give',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handleGiveMerit({ interaction, context });
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		return handleMeritAutocomplete({
			interaction,
			commandName: this.name
		});
	}
}
