import type { Guild, GuildMember } from 'discord.js';

import { getGuildMemberOrThrow } from '../../../discord/guild/guildMembers';
import { createChildExecutionContext, type ExecutionContext } from '../../../logging/executionContext';
import { createDivisionMembershipDeps } from '../../../services/division-membership/createDivisionMembershipDeps';
import { mapNicknameSyncResult, processGuildMemberRoleChange } from '../../../services/guild-member-change/guildMemberChangeService';
import { reconcileDivisionMemberships } from '../../../services/division-membership/reconcileDivisionMemberships';
import { createGuildNicknameServiceDeps } from '../../../services/nickname/createGuildNicknameServiceDeps';
import { syncNicknameForUser } from '../../../services/nickname/nicknameService';

export function createGuildMemberChangeDeps({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	return {
		resolveMember: ({ discordUserId }: { discordUserId: string }) =>
			getGuildMemberOrThrow({
				guild,
				discordUserId
			}).catch(() => null),
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
		}
	} satisfies Parameters<typeof processGuildMemberRoleChange<GuildMember>>[0];
}
