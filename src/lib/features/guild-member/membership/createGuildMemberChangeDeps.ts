import type { Guild, GuildMember } from 'discord.js';

import { ENV_MERIT_BADGE_ROLES } from '../../../../config/env/discord';
import { getGuildMember } from '../../../discord/guild/guildMembers';
import { createChildExecutionContext, type ExecutionContext } from '../../../logging/executionContext';
import { createDivisionMembershipDeps } from '../../../services/division-membership/createDivisionMembershipDeps';
import {
	mapNicknameSyncResult,
	processGuildMemberRoleChange,
	toGuildMemberBadgeOutcome
} from '../../../services/guild-member-change/guildMemberChangeService';
import { createMeritBadgeSyncRuntime } from '../../../services/merit-badge/createMeritBadgeSyncRuntime';
import { reconcileDivisionMemberships } from '../../../services/division-membership/reconcileDivisionMemberships';
import { createGuildNicknameServiceDeps } from '../../../services/nickname/createGuildNicknameServiceDeps';
import { syncNicknameForUser } from '../../../services/nickname/nicknameService';

export function createGuildMemberChangeDeps({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	const resolveMemberLogger = context.logger.child({
		caller: 'createGuildMemberChangeDeps.resolveMember'
	});
	const badges = createMeritBadgeSyncRuntime({
		guild,
		context,
		auditReason: 'Merit badge sync after member role change'
	});

	return {
		resolveMember: ({ discordUserId }: { discordUserId: string }) =>
			getGuildMember({
				guild,
				discordUserId,
				logger: resolveMemberLogger
			}),
		reconcileMemberships: async ({ member }: { member: GuildMember }) =>
			reconcileDivisionMemberships(createDivisionMembershipDeps(), {
				discordUserId: member.id,
				currentRoleIds: member.roles.cache.keys()
			}),
		syncNickname: async ({ member }: { member: GuildMember }) => {
			const nicknameSyncResult = await syncNicknameForUser(
				createGuildNicknameServiceDeps({
					guild,
					context: createChildExecutionContext({
						context,
						bindings: {
							targetDiscordUserId: member.id,
							step: 'buildUserNickname'
						}
					})
				}),
				{
					discordUserId: member.id,
					setReason: 'Guild member update nickname sync',
					contextBindings: {
						step: 'buildUserNickname'
					}
				}
			);

			return mapNicknameSyncResult(nicknameSyncResult);
		},
		isBadgeRole: (roleId: string) => ENV_MERIT_BADGE_ROLES.roleIds.has(roleId),
		// No total override: listener paths always re-read the total inside the member lock.
		syncBadge: async ({ discordUserId }: { discordUserId: string }) => toGuildMemberBadgeOutcome(await badges.syncMember({ discordUserId }))
	} satisfies Parameters<typeof processGuildMemberRoleChange<GuildMember>>[0];
}
