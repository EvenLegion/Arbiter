import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ENV_DISCORD } from '../config/env';
import { handleRecoverIaeEvent } from '../lib/features/debug/handleRecoverIaeEvent';
import { createCommandExecutionContext } from '../lib/logging/commandExecutionContext';

/** Temporary, event-1011-only recovery ingress. Remove after verified recovery. */
@ApplyOptions<Subcommand.Options>({
	description: 'Temporary targeted recovery commands',
	preconditions: ['GuildOnly', 'StaffOnly'],
	subcommands: [{ name: 'recover_iae_event', chatInputRun: 'chatInputRecoverIaeEvent' }]
})
export class DebugCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName('debug')
					.setDescription('Temporary targeted recovery commands.')
					.addSubcommand((command) =>
						command
							.setName('recover_iae_event')
							.setDescription('Inspect or recover review data for IAE event 1011 only. Never awards merits.')
							.addBooleanOption((option) =>
								option
									.setName('apply')
									.setDescription('False by default: inspect only. True applies the targeted recovery.')
									.setRequired(false)
							)
					),
			{ guildIds: [ENV_DISCORD.DISCORD_GUILD_ID] }
		);
	}

	public async chatInputRecoverIaeEvent(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createCommandExecutionContext({ interaction, flow: 'debug.recoverIaeEvent' });
		return handleRecoverIaeEvent({ interaction, context });
	}
}
