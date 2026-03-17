import type { Guild, GuildMember } from 'discord.js';

import { listCachedDivisions } from '../../discord/divisionCacheGateway';
import { getGuildMemberOrThrow } from '../../discord/guildMemberGateway';
import { divisionRepository } from '../../../integrations/prisma/repositories';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { reconcileDivisionMemberships } from '../../services/division-membership/reconcileDivisionMemberships';
import { mapNicknameSyncResult, processGuildMemberRoleChange } from '../../services/guild-member-change/guildMemberChangeService';
import { syncNicknameForUser } from '../../services/nickname/nicknameService';
import { createGuildNicknameServiceDeps } from './nicknameServiceAdapters';

export function createGuildMemberChangeDeps({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	return {
		resolveMember: ({ discordUserId }: { discordUserId: string }) =>
			getGuildMemberOrThrow({
				guild,
				discordUserId
			}).catch(() => null),
		reconcileMemberships: async ({ member }: { member: GuildMember }) =>
			reconcileDivisionMemberships(
				{
					listTrackedDivisions: () =>
						listCachedDivisions({}).then((divisions) =>
							divisions.map((division) => ({
								id: division.id,
								name: division.name,
								discordRoleId: division.discordRoleId
							}))
						),
					listUserDivisions: ({ discordUserId }) =>
						divisionRepository.listUserDivisions({
							discordUserId
						}),
					addMemberships: async ({ discordUserId, divisionIds }) => {
						await divisionRepository.addMemberships({
							discordUserId,
							divisionIds
						});
					},
					removeMemberships: async ({ discordUserId, divisionIds }) => {
						await divisionRepository.removeMemberships({
							discordUserId,
							divisionIds
						});
					}
				},
				{
					discordUserId: member.id,
					currentRoleIds: member.roles.cache.keys()
				}
			),
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
