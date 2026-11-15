import { RESTEvents, type Guild, type GuildMember, type RateLimitData } from 'discord.js';

import { refreshDivisionCache } from '../../../discord/guild/divisions';
import { getDbUser, listDbUsers } from '../../../discord/guild/users';
import { createChildExecutionContext, type ExecutionContext } from '../../../logging/executionContext';
import { resolveBulkNicknameTargets } from '../../../services/bulk-nickname/bulkNicknameService';
import { createGuildMemberAccessGateway } from '../../../services/guild-member/guildMemberAccessGateway';
import { createGuildNicknameWorkflow } from '../../../services/nickname/guildNicknameWorkflow';

export function createStaffBulkNicknameSyncDeps({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	const members = createGuildMemberAccessGateway({
		guild
	});

	return {
		prepare: refreshDivisionCache,
		resolveTargets: ({ requestedDiscordUserId }: { requestedDiscordUserId?: string }) =>
			resolveBulkNicknameTargets(
				{
					get: ({ discordUserId }) => getDbUser({ discordUserId }),
					findMany: () => listDbUsers()
				},
				{
					requestedDiscordUserId
				}
			),
		getMember: members.getMember,
		listMembers: members.listMembers,
		watchRateLimits: (onWait: (waitMs: number) => void) => {
			const listener = (info: RateLimitData) => onWait(info.timeToReset);
			guild.client.rest.on(RESTEvents.RateLimited, listener);
			return () => {
				guild.client.rest.off(RESTEvents.RateLimited, listener);
			};
		},
		syncNickname: ({
			target,
			member,
			includeStaff,
			dryRun
		}: {
			target: {
				id: string;
				discordUserId: string;
			};
			member: GuildMember;
			includeStaff: boolean;
			dryRun: boolean;
		}) =>
			createGuildNicknameWorkflow({
				guild,
				context: createChildExecutionContext({
					context,
					bindings: {
						targetDbUserId: target.id,
						targetDiscordUserId: target.discordUserId,
						step: 'buildUserNickname'
					}
				}),
				includeStaff,
				dryRun
			})
				.syncNickname({
					discordUserId: member.id,
					setReason: 'Staff nickname sync'
				})
				.then((result) => {
					if (result.kind !== 'synced') {
						throw new Error(`Failed to sync nickname: ${result.kind}`);
					}

					return {
						outcome: result.outcome,
						reason: result.reason,
						currentNickname: result.member.nickname,
						computedNickname: result.computedNickname
					};
				})
	};
}
