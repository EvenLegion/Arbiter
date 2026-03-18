import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';

import { ENV_CONFIG, ENV_DISCORD } from '../config/env';
import { handleDevAutocomplete } from '../lib/features/dev/devAutocompleteProvider';
import { DEV_NICKNAME_MODE_CONFIG } from '../lib/features/dev/devNicknameModes';
import { handleDevNicknameTransform } from '../lib/features/dev/handlers/handleDevNicknameTransform';
import { handleSyncGuildMembers } from '../lib/features/dev/handlers/handleSyncGuildMembers';
import { createCommandExecutionContext } from '../lib/logging/commandExecutionContext';
import { isNicknameTransformMode, type NicknameTransformMode } from '../lib/services/bulk-nickname/nicknameTransform';

const DEV_NICKNAME_USER_OPTION_DESCRIPTION = 'Optional target user (search by guild nickname).';

const DEV_NICKNAME_SUBCOMMAND_ENTRIES = DEV_NICKNAME_MODE_CONFIG.map(({ mode }) => ({
	name: mode,
	chatInputRun: 'chatInputNicknameTransform' as const
}));

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
			entries: DEV_NICKNAME_SUBCOMMAND_ENTRIES
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
						DEV_NICKNAME_MODE_CONFIG.reduce(
							(builder, { mode, description }) =>
								builder.addSubcommand((subcommand) =>
									subcommand
										.setName(mode)
										.setDescription(description)
										.addStringOption((option) =>
											option
												.setName('user')
												.setDescription(DEV_NICKNAME_USER_OPTION_DESCRIPTION)
												.setRequired(false)
												.setAutocomplete(true)
										)
								),
							group.setName('nickname').setDescription('Development nickname mutation commands.')
						)
					),
			{
				guildIds: [ENV_DISCORD.DISCORD_GUILD_ID]
			}
		);
	}

	public async chatInputSyncGuildMembers(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createCommandExecutionContext({
			interaction,
			flow: 'dev.syncGuildMembers'
		});

		return handleSyncGuildMembers({
			interaction,
			context
		});
	}

	public async chatInputNicknameTransform(interaction: Subcommand.ChatInputCommandInteraction) {
		const mode = interaction.options.getSubcommand(true);
		if (!isNicknameTransformMode(mode)) {
			throw new Error(`Unsupported dev nickname transform mode: ${mode}`);
		}

		return this.runNicknameTransform(interaction, mode);
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		return handleDevAutocomplete({
			interaction,
			commandName: this.name
		});
	}

	private async runNicknameTransform(interaction: Subcommand.ChatInputCommandInteraction, mode: NicknameTransformMode) {
		const context = createCommandExecutionContext({
			interaction,
			flow: `dev.nickname.${mode}`,
			bindings: {
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
