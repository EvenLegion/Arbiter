import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';

import { ENV_CONFIG, ENV_DISCORD } from '../config/env';
import { handleDevAutocomplete } from '../lib/features/dev/devAutocompleteProvider';
import { handleDevNicknameTransform } from '../lib/features/dev/handleDevNicknameTransform';
import { handleSyncGuildMembers } from '../lib/features/dev/handleSyncGuildMembers';
import { type NicknameTransformMode } from '../lib/features/dev/nicknameTransform';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Subcommand.Options>({
	description: 'Development commands',
	enabled: ENV_CONFIG.NODE_ENV === 'development',
	preconditions: ['GuildOnly', 'StaffOnly'],
	subcommands: [
		{
			name: 'sync_guild_members',
			chatInputRun: 'chatInputSyncGuildMembers'
		},
		{
			type: 'group',
			name: 'nickname',
			entries: [
				{
					name: 'remove-prefix',
					chatInputRun: 'chatInputNicknameRemovePrefix'
				},
				{
					name: 'remove-suffix',
					chatInputRun: 'chatInputNicknameRemoveSuffix'
				},
				{
					name: 'reset',
					chatInputRun: 'chatInputNicknameReset'
				}
			]
		}
	]
})
export class DevCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		if (ENV_CONFIG.NODE_ENV !== 'development') {
			return;
		}

		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName('dev')
					.setDescription('Development-only commands.')
					.addSubcommand((subcommand) =>
						subcommand
							.setName('sync_guild_members')
							.setDescription('Sync all guild members with the database (users, divisions, and nicknames).')
					)
					.addSubcommandGroup((group) =>
						group
							.setName('nickname')
							.setDescription('Development nickname mutation commands.')
							.addSubcommand((subcommand) =>
								subcommand
									.setName('remove-prefix')
									.setDescription('Remove division-style prefixes from nicknames for one user or all users in the DB.')
									.addStringOption((option) =>
										option
											.setName('user')
											.setDescription('Optional target user (search by guild nickname).')
											.setRequired(false)
											.setAutocomplete(true)
									)
							)
							.addSubcommand((subcommand) =>
								subcommand
									.setName('remove-suffix')
									.setDescription('Remove merit-rank suffixes from nicknames for one user or all users in the DB.')
									.addStringOption((option) =>
										option
											.setName('user')
											.setDescription('Optional target user (search by guild nickname).')
											.setRequired(false)
											.setAutocomplete(true)
									)
							)
							.addSubcommand((subcommand) =>
								subcommand
									.setName('reset')
									.setDescription('Reset nicknames to raw nickname values from the User table.')
									.addStringOption((option) =>
										option
											.setName('user')
											.setDescription('Optional target user (search by guild nickname).')
											.setRequired(false)
											.setAutocomplete(true)
									)
							)
					),
			{
				guildIds: [ENV_DISCORD.DISCORD_GUILD_ID]
			}
		);
	}

	public async chatInputSyncGuildMembers(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'dev.syncGuildMembers',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});

		return handleSyncGuildMembers({
			interaction,
			context
		});
	}

	public async chatInputNicknameRemovePrefix(interaction: Subcommand.ChatInputCommandInteraction) {
		return this.runNicknameTransform(interaction, 'remove-prefix');
	}

	public async chatInputNicknameRemoveSuffix(interaction: Subcommand.ChatInputCommandInteraction) {
		return this.runNicknameTransform(interaction, 'remove-suffix');
	}

	public async chatInputNicknameReset(interaction: Subcommand.ChatInputCommandInteraction) {
		return this.runNicknameTransform(interaction, 'reset');
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		return handleDevAutocomplete({
			interaction,
			commandName: this.name
		});
	}

	private async runNicknameTransform(interaction: Subcommand.ChatInputCommandInteraction, mode: NicknameTransformMode) {
		const context = createExecutionContext({
			bindings: {
				flow: `dev.nickname.${mode}`,
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				mode
			}
		});

		return handleDevNicknameTransform({
			interaction,
			context,
			mode
		});
	}
}
