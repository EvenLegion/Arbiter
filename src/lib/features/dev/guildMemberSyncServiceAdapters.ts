import type { Guild, GuildMember } from 'discord.js';

import { userRepository } from '../../../integrations/prisma/repositories';
import { refreshDivisionCache } from '../../discord/divisionCacheGateway';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { createGuildMemberAccessGateway } from '../guild-member/guildMemberAccessGateway';
import { createGuildNicknameWorkflowGateway } from '../guild-member/guildNicknameWorkflowGateway';
import { reconcileRolesAndMemberships } from '../guild-member/reconcileRolesAndMemberships';

export function createGuildMemberSyncDeps({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	const members = createGuildMemberAccessGateway({
		guild
	});

	return {
		refreshDivisionCache,
		listMembers: async () => [...(await members.listMembers()).values()],
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
			const nicknames = createGuildNicknameWorkflowGateway({
				guild,
				context: createChildExecutionContext({
					context,
					bindings: {
						targetDiscordUserId: member.id,
						targetDbUserId: dbUserId,
						step: 'buildUserNickname'
					}
				})
			});
			const result = await nicknames.syncNickname({
				discordUserId: member.id,
				setReason: 'Development guild member sync'
			});
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
