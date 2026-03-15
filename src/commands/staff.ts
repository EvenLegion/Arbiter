import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import type { Division } from '@prisma/client';
import { DivisionKind } from '@prisma/client';
import { EmbedBuilder, MessageFlags, type GuildMember } from 'discord.js';

import { ENV_CONFIG, ENV_DISCORD } from '../config/env';
import { createManyDivisionMembership, deleteManyDivisionMembership, findManyDivisionMemberships, findManyDivisions } from '../integrations/prisma';
import { resolveDiscordUserIdOptionValue, sortMembersByQuery } from '../lib/discord/memberSearch';
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
								'Failed to load guild member for single-user staff nickname sync command'
							);
							await interaction.editReply({
								content: `Failed to load guild member for nickname sync. requestId=\`${context.requestId}\``
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
						'Loaded guild member for single-user staff nickname sync command'
					);
				} else {
					const allMembers = await this.container.utilities.member.listAll({ guild }).catch(async (error: unknown) => {
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
						'Loaded guild members for staff nickname sync command'
					);
				}

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
							includeStaff,
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

	public async chatInputDivisionMembershipAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		await this.runDivisionMembershipCommand({
			interaction,
			mode: 'add'
		});
	}

	public async chatInputDivisionMembershipRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		await this.runDivisionMembershipCommand({
			interaction,
			mode: 'remove'
		});
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		const subcommandGroupName = interaction.options.getSubcommandGroup(false);
		const subcommandName = interaction.options.getSubcommand(false);
		const focused = interaction.options.getFocused(true);

		if (subcommandName === 'sync_nickname' && focused.name === 'user') {
			await this.respondWithGuildMemberAutocomplete({
				interaction,
				subcommandGroupName,
				subcommandName,
				focusedOptionName: focused.name
			});
			return;
		}

		if (subcommandGroupName === 'division_membership' && focused.name === 'nickname') {
			await this.respondWithGuildMemberAutocomplete({
				interaction,
				subcommandGroupName,
				subcommandName,
				focusedOptionName: focused.name
			});
			return;
		}

		if (subcommandGroupName === 'division_membership' && focused.name === 'division_name') {
			await this.respondWithDivisionAutocomplete({
				interaction,
				subcommandGroupName,
				subcommandName,
				focusedOptionName: focused.name
			});
			return;
		}

		await interaction.respond([]);
	}

	private async runDivisionMembershipCommand({
		interaction,
		mode
	}: {
		interaction: Subcommand.ChatInputCommandInteraction;
		mode: 'add' | 'remove';
	}) {
		const context = createExecutionContext({
			bindings: {
				flow: `staff.divisionMembership.${mode}`,
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});
		const logger = context.logger.child({ caller: 'runDivisionMembershipCommand', mode });

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await Promise.resolve()
			.then(async () => {
				const requestedDiscordUserId = resolveDiscordUserIdOptionValue(interaction.options.getString('nickname', true));
				const syncNickname = interaction.options.getBoolean('sync_nickname', false) ?? true;
				if (!requestedDiscordUserId) {
					await interaction.editReply({
						content: `Invalid \`nickname\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
					});
					return;
				}

				const requestedDivisionSelection = interaction.options.getString('division_name', true).trim();
				const [targetUser, selectedDivision] = await Promise.all([
					this.container.utilities.userDirectory.get({
						discordUserId: requestedDiscordUserId
					}),
					this.resolveDivisionSelection({
						value: requestedDivisionSelection
					})
				]);

				if (!targetUser) {
					await interaction.editReply({
						content: `Selected user is not present in the User table. requestId=\`${context.requestId}\``
					});
					return;
				}

				if (!selectedDivision) {
					await interaction.editReply({
						content: `Selected division was not found. Choose a division from autocomplete. requestId=\`${context.requestId}\``
					});
					return;
				}

				const existingMemberships = await findManyDivisionMemberships({
					userId: targetUser.id
				});
				const hasMembership = existingMemberships.some((membership) => membership.divisionId === selectedDivision.id);

				if (mode === 'add' && hasMembership) {
					await interaction.editReply({
						content: `<@${requestedDiscordUserId}> already has the **${selectedDivision.name}** division membership. requestId=\`${context.requestId}\``
					});
					return;
				}

				if (mode === 'remove' && !hasMembership) {
					await interaction.editReply({
						content: `<@${requestedDiscordUserId}> does not have the **${selectedDivision.name}** division membership. requestId=\`${context.requestId}\``
					});
					return;
				}

				const result =
					mode === 'add'
						? await createManyDivisionMembership({
								userId: targetUser.id,
								divisionIds: [selectedDivision.id]
							})
						: await deleteManyDivisionMembership({
								userId: targetUser.id,
								divisionIds: [selectedDivision.id]
							});

				logger.info(
					{
						targetDbUserId: targetUser.id,
						targetDiscordUserId: targetUser.discordUserId,
						targetDiscordUsername: targetUser.discordUsername,
						divisionId: selectedDivision.id,
						divisionCode: selectedDivision.code,
						divisionName: selectedDivision.name,
						resultCount: result.count,
						syncNickname
					},
					mode === 'add' ? 'Added division membership from staff command' : 'Removed division membership from staff command'
				);

				const baseContent =
					mode === 'add'
						? `Added **${selectedDivision.name}** to <@${requestedDiscordUserId}>. Database membership updated.`
						: `Removed **${selectedDivision.name}** from <@${requestedDiscordUserId}>. Database membership updated.`;
				if (!syncNickname) {
					await interaction.editReply({
						content: `${baseContent} Nickname sync skipped by option. requestId=\`${context.requestId}\``
					});
					return;
				}

				const guild = await this.container.utilities.guild.getOrThrow().catch((error: unknown) => {
					logger.error(
						{
							err: error,
							targetDbUserId: targetUser.id,
							targetDiscordUserId: targetUser.discordUserId
						},
						'Failed to resolve configured guild for division membership nickname sync'
					);
					return null;
				});
				if (!guild) {
					await interaction.editReply({
						content: `${baseContent} Nickname sync failed because the guild could not be resolved. requestId=\`${context.requestId}\``
					});
					return;
				}

				const member = await this.container.utilities.member
					.get({
						guild,
						discordUserId: requestedDiscordUserId
					})
					.catch((error: unknown) => {
						logger.error(
							{
								err: error,
								targetDbUserId: targetUser.id,
								targetDiscordUserId: targetUser.discordUserId
							},
							'Failed to load guild member for division membership nickname sync'
						);
						return undefined;
					});
				if (member === undefined) {
					await interaction.editReply({
						content: `${baseContent} Nickname sync failed while loading the guild member. requestId=\`${context.requestId}\``
					});
					return;
				}
				if (!member) {
					await interaction.editReply({
						content: `${baseContent} Nickname sync skipped because the user is not in the guild. requestId=\`${context.requestId}\``
					});
					return;
				}

				const nicknameSyncResult = await this.container.utilities.member
					.syncComputedNickname({
						member,
						includeStaff: true,
						context: createChildExecutionContext({
							context,
							bindings: {
								targetDbUserId: targetUser.id,
								targetDiscordUserId: targetUser.discordUserId,
								step: 'syncComputedNicknameAfterDivisionMembershipUpdate'
							}
						}),
						setReason: mode === 'add' ? 'Staff division membership add sync' : 'Staff division membership remove sync'
					})
					.catch((error: unknown) => {
						logger.error(
							{
								err: error,
								targetDbUserId: targetUser.id,
								targetDiscordUserId: targetUser.discordUserId,
								divisionId: selectedDivision.id,
								divisionCode: selectedDivision.code
							},
							'Failed to sync nickname after staff division membership update'
						);
						return null;
					});
				if (!nicknameSyncResult) {
					await interaction.editReply({
						content: `${baseContent} Nickname sync failed. requestId=\`${context.requestId}\``
					});
					return;
				}

				if (nicknameSyncResult.outcome === 'updated') {
					await interaction.editReply({
						content: `${baseContent} Nickname synced to \`${nicknameSyncResult.computedNickname}\`. requestId=\`${context.requestId}\``
					});
					return;
				}

				if (nicknameSyncResult.outcome === 'unchanged') {
					await interaction.editReply({
						content: `${baseContent} Nickname already matched \`${nicknameSyncResult.computedNickname}\`. requestId=\`${context.requestId}\``
					});
					return;
				}

				await interaction.editReply({
					content: `${baseContent} Nickname sync skipped: ${nicknameSyncResult.reason ?? 'No sync reason provided'}. requestId=\`${context.requestId}\``
				});
			})
			.catch(async (error: unknown) => {
				logger.error(
					{
						err: error,
						requestId: context.requestId
					},
					'Unhandled error while running staff division membership command'
				);
				await interaction
					.editReply({
						content: `Failed to update division membership due to an unexpected error. requestId=\`${context.requestId}\``
					})
					.catch((editError: unknown) => {
						logger.error(
							{
								err: editError,
								requestId: context.requestId
							},
							'Failed to edit interaction reply after unhandled staff division membership error'
						);
						return undefined;
					});
			});
	}

	private async respondWithGuildMemberAutocomplete({
		interaction,
		subcommandGroupName,
		subcommandName,
		focusedOptionName
	}: {
		interaction: Subcommand.AutocompleteInteraction;
		subcommandGroupName: string | null;
		subcommandName: string | null;
		focusedOptionName: string;
	}) {
		const guild = await this.container.utilities.guild.getOrThrow().catch(async (error: unknown) => {
			this.container.logger.error(
				{
					err: error,
					commandName: this.name,
					subcommandGroupName,
					subcommandName,
					focusedOptionName
				},
				'Failed to resolve configured guild during staff command autocomplete'
			);
			await interaction.respond([]);
			return null;
		});
		if (!guild) {
			return;
		}

		const query = String(interaction.options.getFocused()).trim().toLowerCase();
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
							subcommandName,
							focusedOptionName,
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

	private async respondWithDivisionAutocomplete({
		interaction,
		subcommandGroupName,
		subcommandName,
		focusedOptionName
	}: {
		interaction: Subcommand.AutocompleteInteraction;
		subcommandGroupName: string | null;
		subcommandName: string | null;
		focusedOptionName: string;
	}) {
		const query = String(interaction.options.getFocused()).trim().toLowerCase();
		const divisions = await findManyDivisions().catch(async (error: unknown) => {
			this.container.logger.error(
				{
					err: error,
					commandName: this.name,
					subcommandGroupName,
					subcommandName,
					focusedOptionName,
					query
				},
				'Failed to load divisions during staff command autocomplete'
			);
			await interaction.respond([]);
			return null;
		});
		if (!divisions) {
			return;
		}

		const matches = divisions
			.filter((division) => {
				if (query.length === 0) {
					return true;
				}

				return division.name.toLowerCase().includes(query) || division.code.toLowerCase().includes(query);
			})
			.sort((left, right) => sortDivisionsByQuery({ left, right, query }));

		await interaction.respond(
			matches.slice(0, 25).map((division) => ({
				name: `${division.name} (${division.code})`.slice(0, 100),
				value: division.code
			}))
		);
	}

	private async resolveDivisionSelection({ value }: { value: string }) {
		const normalizedValue = value.trim().toLowerCase();
		if (normalizedValue.length === 0) {
			return null;
		}

		const divisions = await findManyDivisions();

		return (
			divisions.find((division) => division.code.toLowerCase() === normalizedValue) ??
			divisions.find((division) => division.name.toLowerCase() === normalizedValue) ??
			divisions.find((division) => `${division.name} (${division.code})`.toLowerCase() === normalizedValue) ??
			null
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

function sortDivisionsByQuery({ left, right, query }: { left: Division; right: Division; query: string }) {
	if (query.length === 0) {
		return left.name.localeCompare(right.name) || left.code.localeCompare(right.code);
	}

	const leftNameStarts = left.name.toLowerCase().startsWith(query);
	const rightNameStarts = right.name.toLowerCase().startsWith(query);
	if (leftNameStarts !== rightNameStarts) {
		return leftNameStarts ? -1 : 1;
	}

	const leftCodeStarts = left.code.toLowerCase().startsWith(query);
	const rightCodeStarts = right.code.toLowerCase().startsWith(query);
	if (leftCodeStarts !== rightCodeStarts) {
		return leftCodeStarts ? -1 : 1;
	}

	return left.name.localeCompare(right.name) || left.code.localeCompare(right.code);
}
