import { container } from '@sapphire/framework';
import type { Guild, GuildMember } from 'discord.js';

import { resolveNicknameSyncTargets } from '../guild-member/nicknameSyncTargets';

export function createDevBulkNicknameTransformDeps({ guild }: { guild: Guild }) {
	return {
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
		getCurrentNickname: (member: GuildMember) => (member.nickname ?? member.user.globalName ?? member.user.username).trim(),
		setNickname: async ({ member, nextNickname, reason }: { member: GuildMember; nextNickname: string; reason: string }) => {
			await member.setNickname(nextNickname, reason);
		}
	};
}
