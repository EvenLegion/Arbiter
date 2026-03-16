import { container } from '@sapphire/framework';
import type { Guild, GuildMember } from 'discord.js';

import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { syncNicknameForUser } from '../../services/nickname/nicknameService';
import { createGuildNicknameServiceDeps } from '../guild-member/nicknameServiceAdapters';
import { resolveNicknameSyncTargets } from '../guild-member/nicknameSyncTargets';

export function createStaffBulkNicknameSyncDeps({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	return {
		prepare: () => container.utilities.divisionCache.refresh(),
		resolveTargets: ({ requestedDiscordUserId }: { requestedDiscordUserId?: string }) =>
			resolveNicknameSyncTargets(container.utilities.userDirectory, {
				requestedDiscordUserId
			}),
		getMember: (discordUserId: string) =>
			container.utilities.member.get({
				guild,
				discordUserId
			}),
		listMembers: () => container.utilities.member.listAll({ guild }),
		syncNickname: ({
			target,
			member,
			includeStaff
		}: {
			target: {
				id: string;
				discordUserId: string;
			};
			member: GuildMember;
			includeStaff: boolean;
		}) =>
			syncNicknameForUser(
				createGuildNicknameServiceDeps({
					guild,
					context: createChildExecutionContext({
						context,
						bindings: {
							targetDbUserId: target.id,
							targetDiscordUserId: target.discordUserId,
							step: 'buildUserNickname'
						}
					}),
					includeStaff
				}),
				{
					discordUserId: member.id,
					setReason: 'Staff nickname sync'
				}
			).then((result) => {
				if (result.kind !== 'synced') {
					throw new Error(`Failed to sync nickname: ${result.kind}`);
				}

				return {
					outcome: result.outcome,
					reason: result.reason
				};
			})
	};
}
