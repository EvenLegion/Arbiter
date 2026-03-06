import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { EmbedBuilder, MessageFlags } from 'discord.js';

import { ENV_CONFIG, ENV_DISCORD } from '../config/env';
import { upsertUser } from '../integrations/prisma';
import { reconcileRolesAndMemberships } from '../lib/features/guild-member/reconcileRolesAndMemberships';
import { createChildExecutionContext, createExecutionContext } from '../lib/logging/executionContext';

type FailedMember = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	dbUserId: string | null;
};

@ApplyOptions<Subcommand.Options>({
	description: 'Development commands',
	enabled: ENV_CONFIG.NODE_ENV === 'development',
	preconditions: ['GuildOnly', 'StaffOnly'],
	subcommands: [
		{
			name: 'sync_guild_members',
			chatInputRun: 'chatInputSyncGuildMembers'
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
		const logger = context.logger.child({ caller: 'chatInputSyncGuildMembers' });

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const guild = await this.container.utilities.guild.getOrThrow().catch((error: unknown) => {
			logger.error(
				{
					err: error
				},
				'Failed to resolve configured guild for dev sync command'
			);
			return null;
		});
		if (!guild) {
			await interaction.editReply({ content: 'This command can only be used in a guild.' });
			return;
		}

		await this.container.utilities.divisionCache.refresh();
		const members = await guild.members.fetch();

		let totalMembers = 0;
		let botMembersSkipped = 0;
		let usersUpserted = 0;
		let membershipSyncSucceeded = 0;
		let nicknameComputed = 0;
		let nicknameUpdated = 0;
		let nicknameUnchanged = 0;
		const failedMembers: FailedMember[] = [];

		for (const member of members.values()) {
			totalMembers++;

			if (member.user.bot) {
				botMembersSkipped++;
				continue;
			}

			const memberContext = createChildExecutionContext({
				context,
				bindings: {
					targetDiscordUserId: member.id
				}
			});
			const discordNickname = member.user.globalName ?? member.user.username;
			let dbUserId: string | null = null;

			try {
				const dbUser = await upsertUser({
					discordUserId: member.id,
					discordUsername: member.user.username,
					discordNickname,
					discordAvatarUrl: member.user.displayAvatarURL()
				});
				dbUserId = dbUser.id;
				usersUpserted++;
			} catch (err) {
				failedMembers.push({
					discordUserId: member.id,
					discordUsername: member.user.username,
					discordNickname,
					dbUserId
				});
				logger.error(
					{
						discordUserId: member.id,
						err
					},
					'Failed to upsert user during sync_guild_members'
				);
				continue;
			}

			try {
				await reconcileRolesAndMemberships({
					discordUser: member,
					context: createChildExecutionContext({
						context: memberContext,
						bindings: {
							step: 'reconcileRolesAndMemberships'
						}
					})
				});
				membershipSyncSucceeded++;
			} catch (error) {
				failedMembers.push({
					discordUserId: member.id,
					discordUsername: member.user.username,
					discordNickname,
					dbUserId
				});
				logger.error(
					{
						discordUserId: member.id,
						err: error
					},
					'Failed to sync division memberships during sync_guild_members'
				);
				continue;
			}

			const nicknameSyncResult = await this.container.utilities.member
				.syncComputedNickname({
					member,
					context: memberContext,
					setReason: 'Development guild member sync',
					contextBindings: {
						step: 'buildUserNickname'
					}
				})
				.catch((err: unknown) => {
					logger.error(
						{
							discordUserId: member.id,
							err
						},
						'Failed to sync nickname during sync_guild_members'
					);
					return null;
				});
			if (!nicknameSyncResult) {
				failedMembers.push({
					discordUserId: member.id,
					discordUsername: member.user.username,
					discordNickname,
					dbUserId
				});
				continue;
			}

			if (nicknameSyncResult.outcome === 'skipped') {
				logger.warn(
					{
						discordUserId: member.id,
						discordUsername: member.user.username,
						discordNickname,
						reason: nicknameSyncResult.reason
					},
					'Skipping nickname update'
				);
				continue;
			}

			nicknameComputed++;

			if (nicknameSyncResult.outcome === 'unchanged') {
				nicknameUnchanged++;
				continue;
			}

			nicknameUpdated++;
		}

		logger.info(
			{
				totalMembers,
				botMembersSkipped,
				usersUpserted,
				membershipSyncSucceeded,
				nicknameComputed,
				nicknameUpdated,
				nicknameUnchanged,
				failedMembers
			},
			'Development guild member sync completed'
		);

		const summaryEmbed = new EmbedBuilder()
			.setTitle('Guild Member Sync Complete')
			.setColor(failedMembers.length > 0 ? 0xf59e0b : 0x22c55e)
			.addFields(
				{ name: 'Total Members', value: String(totalMembers), inline: true },
				{ name: 'Bot Members Skipped', value: String(botMembersSkipped), inline: true },
				{ name: 'Users Upserted', value: String(usersUpserted), inline: true },
				{ name: 'Memberships Synced', value: String(membershipSyncSucceeded), inline: true },
				{ name: 'Nicknames Computed', value: String(nicknameComputed), inline: true },
				{ name: 'Nicknames Updated', value: String(nicknameUpdated), inline: true },
				{ name: 'Nicknames Unchanged', value: String(nicknameUnchanged), inline: true },
				{ name: 'Failed Members', value: String(failedMembers.length), inline: true }
			)
			.setTimestamp();

		if (failedMembers.length > 0) {
			const failedPreview = failedMembers
				.slice(0, 10)
				.map((failedMember) => {
					const dbUserPart = failedMember.dbUserId ? ` dbUserId=${failedMember.dbUserId}` : '';
					return `- ${failedMember.discordUsername} (${failedMember.discordUserId})${dbUserPart}`;
				})
				.join('\n');

			summaryEmbed.addFields({
				name: 'Failure Preview',
				value: failedPreview
			});
		}

		await interaction.editReply({ embeds: [summaryEmbed] });
	}
}
