import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';

import { ENV_DISCORD } from '../config/env';
import { DISCORD_MAX_NICKNAME_LENGTH } from '../lib/constants';
import { handleNameChangeTicket } from '../lib/features/ticket/handleNameChangeTicket';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Subcommand.Options>({
	description: 'Ticket commands',
	preconditions: ['GuildOnly'],
	subcommands: [
		{
			name: 'name_change',
			chatInputRun: 'chatInputNameChange'
		}
	]
})
export class TicketCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName('ticket')
					.setDescription('Ticket commands.')
					.addSubcommand((subcommand) =>
						subcommand
							.setName('name_change')
							.setDescription('Request a nickname change (base name only, no division prefix).')
							.addStringOption((option) =>
								option
									.setName('requested_name')
									.setDescription('Base nickname only (no prefix, "|", spaces, or merit-rank symbol)')
									.setRequired(true)
									.setMinLength(1)
									.setMaxLength(DISCORD_MAX_NICKNAME_LENGTH)
							)
							.addStringOption((option) =>
								option.setName('reason').setDescription('Reason for the request').setRequired(true).setMinLength(1).setMaxLength(200)
							)
					),
			{
				guildIds: [ENV_DISCORD.DISCORD_GUILD_ID]
			}
		);
	}

	public async chatInputNameChange(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'ticket.nameChange',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handleNameChangeTicket({
			interaction,
			context
		});
	}
}
