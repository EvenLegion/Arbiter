import type { Guild, GuildMember } from 'discord.js';

import { userRepository } from '../../../integrations/prisma/repositories';
import { refreshDivisionCache } from '../../discord/guild/divisions';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { reconcileGuildMemberDivisionMemberships } from '../division-membership/reconcileGuildMemberDivisionMemberships';
import { createGuildMemberAccessGateway } from '../guild-member/guildMemberAccessGateway';
import { createGuildNicknameWorkflow } from '../nickname/guildNicknameWorkflow';
import type { SyncNicknameForUserResult } from '../nickname/nicknameService';

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
			reconcileGuildMemberDivisionMemberships({
				discordUser: member,
				context: createChildExecutionContext({
					context,
					bindings: {
						targetDiscordUserId: member.id,
						step: 'reconcileGuildMemberDivisionMemberships'
					}
				})
			}),
		syncNickname: async ({ member, dbUserId }: { member: GuildMember; dbUserId: string }) => {
			const nicknames = createGuildNicknameWorkflow({
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
				throw new Error(describeNicknameSyncFailure(result));
			}

			return {
				outcome: result.outcome,
				reason: result.reason
			};
		}
	};
}

function describeNicknameSyncFailure(result: Exclude<SyncNicknameForUserResult<GuildMember>, { kind: 'synced' }>) {
	switch (result.kind) {
		case 'member-not-found':
			return 'Failed to sync nickname: member not found';
		case 'nickname-too-long':
			return 'Failed to sync nickname: computed nickname exceeded Discord maximum length';
		case 'sync-failed':
			return `Failed to sync nickname: ${result.errorMessage}`;
	}
}
