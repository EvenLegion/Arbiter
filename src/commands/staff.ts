import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';

import { ENV_DISCORD } from '../config/env';
import { handlePostDivisionMessage } from '../lib/features/staff/postDivisionSelectionMessage';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Subcommand.Options>({
	description: 'Staff commands',
	preconditions: ['GuildOnly', 'StaffOnly'],
	subcommands: [
		{
			name: 'post-division-message',
			chatInputRun: 'chatInputPostDivisionMessage'
		}
	]
})
export class StaffCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName('staff')
					.setDescription('Staff commands.')
					.addSubcommand((subcommand) =>
						subcommand.setName('post-division-message').setDescription('Post combat and industrial division selection message.')
					),
			{
				guildIds: [ENV_DISCORD.DISCORD_GUILD_ID]
			}
		);
	}

	public async chatInputPostDivisionMessage(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'staff.postDivisionMessage',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handlePostDivisionMessage({ interaction, context });
	}
}
