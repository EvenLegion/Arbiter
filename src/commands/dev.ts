import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { EmbedBuilder, MessageFlags, type GuildMember } from 'discord.js';

import { ENV_CONFIG, ENV_DISCORD } from '../config/env';
import { upsertUser } from '../integrations/prisma';
import { resolveDiscordUserIdOptionValue, sortMembersByQuery } from '../lib/discord/memberSearch';
import { reconcileRolesAndMemberships } from '../lib/features/guild-member/reconcileRolesAndMemberships';
import { stripTrailingMeritRankSuffix } from '../lib/features/guild-member/stripTrailingMeritRankSuffix';
import { DISCORD_MAX_NICKNAME_LENGTH } from '../lib/constants';
import { createChildExecutionContext, createExecutionContext } from '../lib/logging/executionContext';

type FailedMember = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	dbUserId: string | null;
};

type NicknameTransformMode = 'remove-prefix' | 'remove-suffix' | 'reset';

type NicknameSyncTarget = {
	id: string;
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
};

type NicknameSyncFailure = {
	discordUserId: string;
	discordUsername: string;
	dbUserId: string;
	reason: string;
};

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
		const logger = context.logger.child({ caller: 'chatInputSyncGuildMembers' });

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await Promise.resolve()
			.then(async () => {
				const guild = await this.container.utilities.guild.getOrThrow().catch(async (error: unknown) => {
					logger.error(
						{
							err: error
						},
						'Failed to resolve configured guild for dev sync command'
					);
					await interaction.editReply({ content: `This command can only be used in a guild. requestId=\`${context.requestId}\`` });
					return null;
				});
				if (!guild) {
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

					const dbUser = await upsertUser({
						discordUserId: member.id,
						discordUsername: member.user.username,
						discordNickname,
						discordAvatarUrl: member.user.displayAvatarURL()
					}).catch((err: unknown) => {
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
						return null;
					});
					if (!dbUser) {
						continue;
					}
					dbUserId = dbUser.id;
					usersUpserted++;

					const membershipSyncSucceededForUser = await reconcileRolesAndMemberships({
						discordUser: member,
						context: createChildExecutionContext({
							context: memberContext,
							bindings: {
								step: 'reconcileRolesAndMemberships'
							}
						})
					})
						.then(() => true)
						.catch((error: unknown) => {
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
							return false;
						});
					if (!membershipSyncSucceededForUser) {
						continue;
					}
					membershipSyncSucceeded++;

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
			})
			.catch(async (error: unknown) => {
				logger.error(
					{
						err: error,
						requestId: context.requestId
					},
					'Unhandled error while running dev sync_guild_members command'
				);
				await interaction
					.editReply({
						content: `Failed to complete dev sync command due to an unexpected error. requestId=\`${context.requestId}\``
					})
					.catch((editError: unknown) => {
						logger.error(
							{
								err: editError,
								requestId: context.requestId
							},
							'Failed to edit interaction reply after unhandled dev sync_guild_members error'
						);
						return undefined;
					});
			});
	}

	public async chatInputNicknameRemovePrefix(interaction: Subcommand.ChatInputCommandInteraction) {
		await this.runNicknameTransformCommand({
			interaction,
			mode: 'remove-prefix'
		});
	}

	public async chatInputNicknameRemoveSuffix(interaction: Subcommand.ChatInputCommandInteraction) {
		await this.runNicknameTransformCommand({
			interaction,
			mode: 'remove-suffix'
		});
	}

	public async chatInputNicknameReset(interaction: Subcommand.ChatInputCommandInteraction) {
		await this.runNicknameTransformCommand({
			interaction,
			mode: 'reset'
		});
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		const subcommandGroupName = interaction.options.getSubcommandGroup(false);
		const focused = interaction.options.getFocused(true);
		if (subcommandGroupName !== 'nickname' || focused.name !== 'user') {
			await interaction.respond([]);
			return;
		}

		const guild = await this.container.utilities.guild.getOrThrow().catch(async (error: unknown) => {
			this.container.logger.error(
				{
					err: error,
					commandName: this.name,
					subcommandGroupName,
					focusedOptionName: focused.name
				},
				'Failed to resolve configured guild during dev command autocomplete'
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

				return member.displayName.toLowerCase().includes(query);
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
							subcommandGroupName,
							focusedOptionName: focused.name,
							query
						},
						'Failed to fetch members during dev command autocomplete'
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

	private async runNicknameTransformCommand({
		interaction,
		mode
	}: {
		interaction: Subcommand.ChatInputCommandInteraction;
		mode: NicknameTransformMode;
	}) {
		const context = createExecutionContext({
			bindings: {
				flow: `dev.nickname.${mode}`,
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				mode
			}
		});
		const logger = context.logger.child({ caller: 'runNicknameTransformCommand', mode });

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await interaction.editReply({
			content: `Nickname ${mode} started. requestId=\`${context.requestId}\``
		});
		await Promise.resolve()
			.then(async () => {
				const guild = await this.container.utilities.guild.getOrThrow().catch(async (error: unknown) => {
					logger.error(
						{
							err: error
						},
						'Failed to resolve configured guild for dev nickname command'
					);
					await interaction.editReply({
						content: `Failed to resolve guild for dev nickname command. requestId=\`${context.requestId}\``
					});
					return null;
				});
				if (!guild) {
					return;
				}

				const optionValue = interaction.options.getString('user', false);
				const requestedDiscordUserId = resolveDiscordUserIdOptionValue(optionValue);
				if (optionValue && !requestedDiscordUserId) {
					await interaction.editReply({
						content: `Invalid \`user\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
					});
					return;
				}

				const targets = await this.resolveNicknameTargets({ requestedDiscordUserId }).catch(async (error: unknown) => {
					logger.error(
						{
							err: error,
							requestedDiscordUserId
						},
						'Failed to resolve nickname targets from database'
					);
					await interaction.editReply({
						content: `Failed to load users from database. requestId=\`${context.requestId}\``
					});
					return null;
				});
				if (!targets) {
					return;
				}
				if (targets.length === 0) {
					await interaction.editReply({
						content: requestedDiscordUserId
							? `Selected user is not in User table. requestId=\`${context.requestId}\``
							: `No users found in User table. requestId=\`${context.requestId}\``
					});
					return;
				}
				logger.info(
					{
						mode: requestedDiscordUserId ? 'single' : 'all',
						targetCount: targets.length
					},
					'Loaded nickname targets for dev nickname command'
				);
				const guildMembersById = new Map<string, GuildMember>();
				if (requestedDiscordUserId) {
					const singleMember = await this.container.utilities.member
						.get({
							guild,
							discordUserId: requestedDiscordUserId
						})
						.catch(async (error: unknown) => {
							logger.error(
								{
									err: error,
									requestedDiscordUserId
								},
								'Failed to load guild member for single-user dev nickname command'
							);
							await interaction.editReply({
								content: `Failed to load guild member for dev nickname command. requestId=\`${context.requestId}\``
							});
							return undefined;
						});
					if (singleMember === undefined) {
						return;
					}
					if (singleMember) {
						guildMembersById.set(singleMember.id, singleMember);
					}
					logger.info(
						{
							requestedDiscordUserId,
							guildMemberCount: guildMembersById.size
						},
						'Loaded guild member for single-user dev nickname command'
					);
				} else {
					const allMembers = await this.container.utilities.member.listAll({ guild }).catch(async (error: unknown) => {
						logger.error(
							{
								err: error
							},
							'Failed to load guild members for dev nickname command'
						);
						await interaction.editReply({
							content: `Failed to load guild members for dev nickname command. requestId=\`${context.requestId}\``
						});
						return null;
					});
					if (!allMembers) {
						return;
					}
					for (const [memberId, member] of allMembers) {
						guildMembersById.set(memberId, member);
					}
					logger.info(
						{
							guildMemberCount: guildMembersById.size
						},
						'Loaded guild members for dev nickname command'
					);
				}

				let updated = 0;
				let unchanged = 0;
				let missingInGuild = 0;
				let failed = 0;
				let processed = 0;
				const failures: NicknameSyncFailure[] = [];
				const logProgressIfNeeded = () => {
					if (processed % 100 === 0 || processed === targets.length) {
						logger.debug(
							{
								mode,
								processed,
								totalTargets: targets.length,
								updated,
								unchanged,
								missingInGuild,
								failed
							},
							'Dev nickname command progress'
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
							logger.trace(missingMemberLogPayload, 'User exists in User table but not guild; skipping dev nickname command');
						} else {
							logger.error(missingMemberLogPayload, 'User exists in User table but not guild; skipping dev nickname command');
						}
						logProgressIfNeeded();
						continue;
					}

					const currentNickname = (member.nickname ?? member.user.globalName ?? member.user.username).trim();
					const nextNickname = computeTransformedNickname({
						mode,
						currentNickname,
						rawNickname: target.discordNickname
					});
					if (nextNickname.length === 0) {
						failed++;
						failures.push({
							discordUserId: target.discordUserId,
							discordUsername: target.discordUsername,
							dbUserId: target.id,
							reason: 'Computed nickname was empty'
						});
						logger.error(
							{
								targetDbUserId: target.id,
								targetDiscordUserId: target.discordUserId,
								currentNickname
							},
							'Failed dev nickname command because transformed nickname is empty'
						);
						logProgressIfNeeded();
						continue;
					}
					if (nextNickname.length > DISCORD_MAX_NICKNAME_LENGTH) {
						failed++;
						failures.push({
							discordUserId: target.discordUserId,
							discordUsername: target.discordUsername,
							dbUserId: target.id,
							reason: `Computed nickname length ${nextNickname.length} exceeds ${DISCORD_MAX_NICKNAME_LENGTH}`
						});
						logger.error(
							{
								targetDbUserId: target.id,
								targetDiscordUserId: target.discordUserId,
								nextNickname,
								nextNicknameLength: nextNickname.length
							},
							'Failed dev nickname command because transformed nickname is too long'
						);
						logProgressIfNeeded();
						continue;
					}

					if (nextNickname === currentNickname) {
						unchanged++;
						logProgressIfNeeded();
						continue;
					}

					const setReason = resolveSetReason(mode);
					const setSucceeded = await member
						.setNickname(nextNickname, setReason)
						.then(() => true)
						.catch((error: unknown) => {
							failed++;
							failures.push({
								discordUserId: target.discordUserId,
								discordUsername: target.discordUsername,
								dbUserId: target.id,
								reason: error instanceof Error ? error.message : 'Failed setting nickname'
							});
							logger.error(
								{
									err: error,
									targetDbUserId: target.id,
									targetDiscordUserId: target.discordUserId,
									nextNickname
								},
								'Failed setting nickname in dev nickname command'
							);
							return false;
						});
					if (!setSucceeded) {
						logProgressIfNeeded();
						continue;
					}

					updated++;
					logProgressIfNeeded();
				}

				const unsuccessful = failed + missingInGuild;
				logger.info(
					{
						mode,
						totalTargets: targets.length,
						updated,
						unchanged,
						missingInGuild,
						failed,
						unsuccessful
					},
					'Completed dev nickname command'
				);

				const summaryEmbed = new EmbedBuilder()
					.setTitle('Dev Nickname Command Complete')
					.setColor(unsuccessful > 0 ? 0xf59e0b : 0x22c55e)
					.addFields(
						{ name: 'Mode', value: mode, inline: true },
						{ name: 'Target Scope', value: requestedDiscordUserId ? 'Single User' : 'All DB Users', inline: true },
						{ name: 'Targets', value: String(targets.length), inline: true },
						{ name: 'Updated', value: String(updated), inline: true },
						{ name: 'Unchanged', value: String(unchanged), inline: true },
						{ name: 'Missing In Guild', value: String(missingInGuild), inline: true },
						{ name: 'Failed', value: String(failed), inline: true }
					)
					.setTimestamp();

				if (failures.length > 0) {
					const failurePreview = failures
						.slice(0, 10)
						.map((failure) => `- ${failure.discordUsername} (${failure.discordUserId}) dbUserId=${failure.dbUserId} :: ${failure.reason}`)
						.join('\n');
					summaryEmbed.addFields({
						name: 'Failure Preview',
						value: failurePreview.slice(0, 1024)
					});
				}

				const content =
					unsuccessful > 0
						? `Dev nickname command finished with issues. requestId=\`${context.requestId}\``
						: `Dev nickname command finished successfully. requestId=\`${context.requestId}\``;

				await interaction.editReply({
					content,
					embeds: [summaryEmbed]
				});
			})
			.catch(async (error: unknown) => {
				logger.error(
					{
						err: error,
						requestId: context.requestId,
						mode
					},
					'Unhandled error while running dev nickname command'
				);
				await interaction
					.editReply({
						content: `Failed to complete dev nickname command due to an unexpected error. requestId=\`${context.requestId}\``
					})
					.catch((editError: unknown) => {
						logger.error(
							{
								err: editError,
								requestId: context.requestId,
								mode
							},
							'Failed to edit interaction reply after unhandled dev nickname command error'
						);
						return undefined;
					});
			});
	}

	private async resolveNicknameTargets({ requestedDiscordUserId }: { requestedDiscordUserId?: string }): Promise<NicknameSyncTarget[]> {
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

function resolveSetReason(mode: NicknameTransformMode): string {
	switch (mode) {
		case 'remove-prefix':
			return 'Development nickname remove-prefix';
		case 'remove-suffix':
			return 'Development nickname remove-suffix';
		case 'reset':
			return 'Development nickname reset';
	}
}

function computeTransformedNickname({
	mode,
	currentNickname,
	rawNickname
}: {
	mode: NicknameTransformMode;
	currentNickname: string;
	rawNickname: string;
}): string {
	switch (mode) {
		case 'remove-prefix': {
			const withoutPrefix = stripLeadingPrefixSegments(currentNickname);
			return withoutPrefix.length > 0 ? withoutPrefix : currentNickname;
		}
		case 'remove-suffix':
			return stripTrailingMeritRankSuffix(currentNickname);
		case 'reset':
			return rawNickname.trim();
	}
}

function stripLeadingPrefixSegments(value: string): string {
	const trimmed = value.trim();
	return trimmed.replace(/^(?:[^|]+\|\s*)+/u, '').trim();
}
