import { container } from '@sapphire/framework';
import type { Guild, GuildMember } from 'discord.js';

import { userRepository } from '../../../integrations/prisma/repositories';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { syncNicknameForUser } from '../../services/nickname/nicknameService';
import { reconcileRolesAndMemberships } from '../guild-member/reconcileRolesAndMemberships';
import { createGuildNicknameServiceDeps } from '../guild-member/nicknameServiceAdapters';

export function createGuildMemberSyncDeps({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	return {
		refreshDivisionCache: () => container.utilities.divisionCache.refresh(),
		listMembers: async () => [...(await container.utilities.member.listAll({ guild })).values()],
		buildSnapshot: (member: GuildMember) => ({
			discordUserId: member.id,
			discordUsername: member.user.username,
			discordNickname: member.user.globalName ?? member.user.username,
			discordAvatarUrl: member.user.displayAvatarURL(),
			isBot: member.user.bot
		}),
		upsertUser: userRepository.upsert,
		reconcileMemberships: ({ member }: { member: GuildMember }) =>
			reconcileRolesAndMemberships({
				discordUser: member,
				context: createChildExecutionContext({
					context,
					bindings: {
						targetDiscordUserId: member.id,
						step: 'reconcileRolesAndMemberships'
					}
				})
			}),
		syncNickname: async ({ member, dbUserId }: { member: GuildMember; dbUserId: string }) => {
			const result = await syncNicknameForUser(
				createGuildNicknameServiceDeps({
					guild,
					context: createChildExecutionContext({
						context,
						bindings: {
							targetDiscordUserId: member.id,
							targetDbUserId: dbUserId,
							step: 'buildUserNickname'
						}
					})
				}),
				{
					discordUserId: member.id,
					setReason: 'Development guild member sync'
				}
			);
			if (result.kind !== 'synced') {
				throw new Error(`Failed to sync nickname: ${result.kind}`);
			}

			return {
				outcome: result.outcome,
				reason: result.reason
			};
		}
	};
}
