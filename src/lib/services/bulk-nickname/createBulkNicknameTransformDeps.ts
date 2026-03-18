import type { Guild, GuildMember } from 'discord.js';

import { getDbUser, listDbUsers } from '../../discord/guild/users';
import { resolveBulkNicknameTargets } from './bulkNicknameService';
import { createGuildMemberAccessGateway } from '../guild-member/guildMemberAccessGateway';

export function createBulkNicknameTransformDeps({ guild }: { guild: Guild }) {
	const members = createGuildMemberAccessGateway({
		guild
	});

	return {
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
		getCurrentNickname: (member: GuildMember) => (member.nickname ?? member.user.globalName ?? member.user.username).trim(),
		setNickname: async ({ member, nextNickname, reason }: { member: GuildMember; nextNickname: string; reason: string }) => {
			await member.setNickname(nextNickname, reason);
		}
	};
}
