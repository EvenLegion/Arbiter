import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { DivisionKind } from '@prisma/client';
import { EmbedBuilder, MessageFlags, type GuildMember } from 'discord.js';

import { ENV_CONFIG, ENV_DISCORD } from '../config/env';
import { handlePostDivisionMessage } from '../lib/features/staff/postDivisionSelectionMessage';
import { createChildExecutionContext, createExecutionContext } from '../lib/logging/executionContext';

type SyncNicknameTarget = {
	id: string;
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
};

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

	public async chatInputSyncNickname(interaction: Subcommand.ChatInputCommandInteraction) {
		const context = createExecutionContext({
			bindings: {
				flow: 'staff.syncNickname',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});
		const logger = context.logger.child({ caller: 'chatInputSyncNickname' });

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await interaction.editReply({
			content: `Nickname sync started. requestId=\`${context.requestId}\``
		});
		await Promise.resolve()
			.then(async () => {
				const guild = await this.container.utilities.guild.getOrThrow().catch(async (error: unknown) => {
					logger.error(
						{
							err: error
						},
						'Failed to resolve configured guild for staff nickname sync command'
					);
					await interaction.editReply({
						content: `Failed to resolve guild for nickname sync. requestId=\`${context.requestId}\``
					});
					return null;
				});
				if (!guild) {
					return;
				}
				logger.info(
					{
						discordGuildId: guild.id
					},
					'Resolved configured guild for staff nickname sync command'
				);

				const optionValue = interaction.options.getString('user', false);
				const requestedDiscordUserId = resolveDiscordUserIdOptionValue(optionValue);
				const includeStaff = interaction.options.getBoolean('include_staff', false) ?? false;
				if (optionValue && !requestedDiscordUserId) {
					await interaction.editReply({
						content: `Invalid \`user\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
					});
					return;
				}

				const refreshSucceeded = await this.container.utilities.divisionCache
					.refresh()
					.then(() => true)
					.catch(async (error: unknown) => {
						logger.error(
							{
								err: error
							},
							'Failed to refresh division cache before nickname sync'
						);
						await interaction.editReply({
							content: `Failed to refresh division cache. requestId=\`${context.requestId}\``
						});
						return false;
					});
				if (!refreshSucceeded) {
					return;
				}
				logger.info('Refreshed division cache for staff nickname sync command');

				const targets = await this.resolveSyncTargets({ requestedDiscordUserId }).catch(async (error: unknown) => {
					logger.error(
						{
							err: error,
							requestedDiscordUserId
						},
						'Failed to load nickname sync targets from database'
					);
					await interaction.editReply({
						content: `Failed to load users from the database. requestId=\`${context.requestId}\``
					});
					return null;
				});
				if (!targets) {
					return;
				}
				logger.info(
					{
						mode: requestedDiscordUserId ? 'single' : 'all',
						targetCount: targets.length,
						includeStaff
					},
					'Loaded nickname sync targets from database'
				);

				if (targets.length === 0) {
					await interaction.editReply({
						content: requestedDiscordUserId
							? `Selected user is not present in the User table. requestId=\`${context.requestId}\``
							: `No users found in the User table. requestId=\`${context.requestId}\``
					});
					return;
				}
				const guildMembersById = await this.container.utilities.member.listAll({ guild }).catch(async (error: unknown) => {
					logger.error(
						{
							err: error
						},
						'Failed to load guild members for staff nickname sync command'
					);
					await interaction.editReply({
						content: `Failed to load guild members for nickname sync. requestId=\`${context.requestId}\``
					});
					return null;
				});
				if (!guildMembersById) {
					return;
				}
				logger.info(
					{
						guildMemberCount: guildMembersById.size
					},
					'Loaded guild members for staff nickname sync command'
				);

				let attempted = 0;
				let updated = 0;
				let unchanged = 0;
				let skippedStaff = 0;
				let skippedByRule = 0;
				let missingInGuild = 0;
				let failed = 0;
				let processed = 0;
				const logProgressIfNeeded = () => {
					if (processed % 100 === 0 || processed === targets.length) {
						logger.info(
							{
								processed,
								totalTargets: targets.length,
								includeStaff,
								attempted,
								updated,
								unchanged,
								skippedStaff,
								skippedByRule,
								missingInGuild,
								failed
							},
							'Staff nickname sync progress'
						);
					}
				};

				for (const target of targets) {
					processed++;
					const member = guildMembersById.get(target.discordUserId) ?? null;

					if (!member) {
						missingInGuild++;
						const missingMemberLogPayload = {
							targetDbUserId: target.id,
							targetDiscordUserId: target.discordUserId,
							targetDiscordUsername: target.discordUsername
						};
						if (ENV_CONFIG.NODE_ENV === 'development') {
							logger.trace(missingMemberLogPayload, 'User exists in User table but is no longer in guild; skipping nickname sync');
						} else {
							logger.error(missingMemberLogPayload, 'User exists in User table but is no longer in guild; skipping nickname sync');
						}
						logProgressIfNeeded();
						continue;
					}

					const hasStaffRole = await this.container.utilities.divisionRolePolicy
						.memberHasDivisionKindRole({
							member,
							requiredRoleKinds: [DivisionKind.STAFF]
						})
						.catch((error: unknown) => {
							failed++;
							logger.error(
								{
									err: error,
									targetDbUserId: target.id,
									targetDiscordUserId: target.discordUserId
								},
								'Failed to resolve staff role status for nickname sync target'
							);
							return null;
						});
					if (hasStaffRole === null) {
						logProgressIfNeeded();
						continue;
					}
					if (hasStaffRole && !includeStaff) {
						skippedStaff++;
						logProgressIfNeeded();
						continue;
					}

					attempted++;
					const targetContext = createChildExecutionContext({
						context,
						bindings: {
							targetDbUserId: target.id,
							targetDiscordUserId: target.discordUserId
						}
					});
					const syncResult = await this.container.utilities.member
						.syncComputedNickname({
							member,
							context: targetContext,
							setReason: 'Staff nickname sync',
							contextBindings: {
								step: 'buildUserNickname'
							}
						})
						.catch((error: unknown) => {
							failed++;
							logger.error(
								{
									err: error,
									targetDbUserId: target.id,
									targetDiscordUserId: target.discordUserId
								},
								'Failed to sync nickname for target user'
							);
							return null;
						});
					if (!syncResult) {
						logProgressIfNeeded();
						continue;
					}

					if (syncResult.outcome === 'skipped') {
						skippedByRule++;
						logger.warn(
							{
								targetDbUserId: target.id,
								targetDiscordUserId: target.discordUserId,
								reason: syncResult.reason
							},
							'Skipping nickname sync due to syncComputedNickname rule'
						);
						logProgressIfNeeded();
						continue;
					}

					if (syncResult.outcome === 'updated') {
						updated++;
					} else {
						unchanged++;
					}
					logProgressIfNeeded();
				}

				const unsuccessful = failed + missingInGuild;
				logger.info(
					{
						mode: requestedDiscordUserId ? 'single' : 'all',
						includeStaff,
						totalTargets: targets.length,
						attempted,
						updated,
						unchanged,
						skippedStaff,
						skippedByRule,
						missingInGuild,
						failed,
						unsuccessful
					},
					'Completed staff nickname sync'
				);

				const summaryEmbed = new EmbedBuilder()
					.setTitle('Nickname Sync Complete')
					.setColor(unsuccessful > 0 ? 0xf59e0b : 0x22c55e)
					.addFields(
						{ name: 'Mode', value: requestedDiscordUserId ? 'Single User' : 'All DB Users', inline: true },
						{ name: 'Include Staff', value: includeStaff ? 'Yes' : 'No', inline: true },
						{ name: 'Targets', value: String(targets.length), inline: true },
						{ name: 'Attempted', value: String(attempted), inline: true },
						{ name: 'Updated', value: String(updated), inline: true },
						{ name: 'Unchanged', value: String(unchanged), inline: true },
						{ name: 'Skipped Staff', value: String(skippedStaff), inline: true },
						{ name: 'Skipped By Rule', value: String(skippedByRule), inline: true },
						{ name: 'Missing In Guild', value: String(missingInGuild), inline: true },
						{ name: 'Failed', value: String(failed), inline: true }
					)
					.setTimestamp();

				const content =
					unsuccessful > 0
						? `Some nickname sync operations were unsuccessful. Share requestId=\`${context.requestId}\` with TECH.`
						: `Nickname sync succeeded. requestId=\`${context.requestId}\``;

				await interaction.editReply({
					content,
					embeds: [summaryEmbed]
				});
			})
			.catch(async (error: unknown) => {
				logger.error(
					{
						err: error,
						requestId: context.requestId
					},
					'Unhandled error while running staff nickname sync command'
				);
				await interaction
					.editReply({
						content: `Failed to complete nickname sync due to an unexpected error. requestId=\`${context.requestId}\``
					})
					.catch((editError: unknown) => {
						logger.error(
							{
								err: editError,
								requestId: context.requestId
							},
							'Failed to edit interaction reply after unhandled staff nickname sync error'
						);
						return undefined;
					});
			});
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		const subcommandName = interaction.options.getSubcommand(false);
		const focused = interaction.options.getFocused(true);

		if (subcommandName !== 'sync_nickname' || focused.name !== 'user') {
			await interaction.respond([]);
			return;
		}

		const guild = await this.container.utilities.guild.getOrThrow().catch(async (error: unknown) => {
			this.container.logger.error(
				{
					err: error,
					commandName: this.name,
					subcommandName,
					focusedOptionName: focused.name
				},
				'Failed to resolve configured guild during staff command autocomplete'
			);
			await interaction.respond([]);
			return null;
		});
		if (!guild) {
			return;
		}

		const query = String(focused.value).trim().toLowerCase();
		const cacheMatches = [...guild.members.cache.values()]
			.filter((member) => !member.user.bot)
			.filter((member) => {
				if (query.length === 0) {
					return true;
				}

				const displayName = member.displayName.toLowerCase();
				return displayName.includes(query);
			})
			.sort((a, b) => sortMembersByQuery({ a, b, query }));

		let members = cacheMatches;
		if (!(cacheMatches.length > 0 || query.length === 0)) {
			const collection = await guild.members
				.fetch({
					query,
					limit: 25
				})
				.catch((error: unknown) => {
					this.container.logger.error(
						{
							err: error,
							commandName: this.name,
							subcommandName,
							focusedOptionName: focused.name,
							query
						},
						'Failed to fetch members during staff command autocomplete'
					);
					return null;
				});
			members = collection
				? [...collection.values()].filter((member) => !member.user.bot).sort((a, b) => sortMembersByQuery({ a, b, query }))
				: [];
		}

		await interaction.respond(
			members.slice(0, 25).map((member) => ({
				name: `${member.displayName}`.slice(0, 100),
				value: member.id
			}))
		);
	}

	private async resolveSyncTargets({ requestedDiscordUserId }: { requestedDiscordUserId?: string }): Promise<SyncNicknameTarget[]> {
		if (requestedDiscordUserId) {
			const target = await this.container.utilities.userDirectory.get({
				discordUserId: requestedDiscordUserId
			});

			return target
				? [
						{
							id: target.id,
							discordUserId: target.discordUserId,
							discordUsername: target.discordUsername,
							discordNickname: target.discordNickname
						}
					]
				: [];
		}

		const users = await this.container.utilities.userDirectory.findMany();
		return users.map((user) => ({
			id: user.id,
			discordUserId: user.discordUserId,
			discordUsername: user.discordUsername,
			discordNickname: user.discordNickname
		}));
	}
}

function resolveDiscordUserIdOptionValue(value: string | null): string | undefined {
	if (!value) {
		return undefined;
	}

	const trimmed = value.trim();
	const mentionMatch = /^<@!?(\d+)>$/.exec(trimmed);
	if (mentionMatch) {
		return mentionMatch[1];
	}

	return /^\d{17,20}$/.test(trimmed) ? trimmed : undefined;
}

function sortMembersByQuery({ a, b, query }: { a: GuildMember; b: GuildMember; query: string }) {
	if (query.length === 0) {
		return a.displayName.localeCompare(b.displayName);
	}

	const aStarts = a.displayName.toLowerCase().startsWith(query);
	const bStarts = b.displayName.toLowerCase().startsWith(query);
	if (aStarts !== bStarts) {
		return aStarts ? -1 : 1;
	}

	return a.displayName.localeCompare(b.displayName);
}
