import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';

import { ENV_DISCORD } from '../config/env';
import { handleStaffAutocomplete } from '../lib/features/staff/autocomplete/staffAutocompleteProvider';
import { handlePostDivisionSelectionMessage } from '../lib/features/staff/division-selection/handlePostDivisionSelectionMessage';
import { handleDivisionMembershipCommand } from '../lib/features/staff/division-membership/handleDivisionMembershipCommand';
import { handleStaffSyncNickname } from '../lib/features/staff/nickname-sync/handleStaffSyncNickname';
import { createCommandExecutionContext } from '../lib/logging/commandExecutionContext';

@ApplyOptions<Subcommand.Options>({
	description: 'Staff commands',
	preconditions: ['GuildOnly', 'StaffOnly'],
	subcommands: [
		{
			name: 'post_division_message',
			chatInputRun: 'chatInputPostDivisionMessage'
		},
		{
			name: 'sync_nickname',
			chatInputRun: 'chatInputSyncNickname'
		},
		{
			type: 'group',
			name: 'division_membership',
			entries: [
				{
					name: 'add',
					chatInputRun: 'chatInputDivisionMembershipAdd'
				},
				{
					name: 'remove',
					chatInputRun: 'chatInputDivisionMembershipRemove'
				}
			]
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
						subcommand.setName('post_division_message').setDescription('Post Navy, Marines, and Support division selection message.')
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName('sync_nickname')
							.setDescription('Sync computed nickname for one user or all users in the database.')
							.addStringOption((option) =>
								option.setName('user').setDescription('Optional target user.').setRequired(false).setAutocomplete(true)
							)
							.addBooleanOption((option) =>
								option.setName('include_staff').setDescription('Include staff users in nickname sync.').setRequired(false)
							)
					)
					.addSubcommandGroup((group) =>
						group
							.setName('division_membership')
							.setDescription("Manage a user's division memberships in the database.")
							.addSubcommand((subcommand) =>
								subcommand
									.setName('add')
									.setDescription('Add a division membership to the selected user.')
									.addStringOption((option) =>
										option.setName('division_name').setDescription('Division to add.').setRequired(true).setAutocomplete(true)
									)
									.addStringOption((option) =>
										option.setName('nickname').setDescription('Target user.').setRequired(true).setAutocomplete(true)
									)
									.addBooleanOption((option) =>
										option
											.setName('sync_nickname')
											.setDescription('Whether to sync the user nickname after the membership change. Defaults to true.')
											.setRequired(false)
									)
							)
							.addSubcommand((subcommand) =>
								subcommand
									.setName('remove')
									.setDescription('Remove a division membership from the selected user.')
									.addStringOption((option) =>
										option.setName('division_name').setDescription('Division to remove.').setRequired(true).setAutocomplete(true)
									)
									.addStringOption((option) =>
										option.setName('nickname').setDescription('Target user.').setRequired(true).setAutocomplete(true)
									)
									.addBooleanOption((option) =>
										option
											.setName('sync_nickname')
											.setDescription('Whether to sync the user nickname after the membership change. Defaults to true.')
											.setRequired(false)
									)
							)
					),
			{
				guildIds: [ENV_DISCORD.DISCORD_GUILD_ID]
			}
		);
	}

	public async chatInputPostDivisionMessage(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createCommandExecutionContext({
			interaction,
			flow: 'staff.postDivisionMessage'
		});

		return handlePostDivisionSelectionMessage({ interaction, context });
	}

	public async chatInputSyncNickname(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createCommandExecutionContext({
			interaction,
			flow: 'staff.syncNickname'
		});

		return handleStaffSyncNickname({ interaction, context });
	}

	public async chatInputDivisionMembershipAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createCommandExecutionContext({
			interaction,
			flow: 'staff.divisionMembership.add'
		});

		return handleDivisionMembershipCommand({
			interaction,
			context,
			mode: 'add'
		});
	}

	public async chatInputDivisionMembershipRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createCommandExecutionContext({
			interaction,
			flow: 'staff.divisionMembership.remove'
		});

		return handleDivisionMembershipCommand({
			interaction,
			context,
			mode: 'remove'
		});
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		return handleStaffAutocomplete({
			interaction,
			commandName: this.name
		});
	}
}
