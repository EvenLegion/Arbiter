import type { Guild, GuildMember } from 'discord.js';

import { listGuildMembers } from '../../discord/guildMemberGateway';
import { findGuildMemberByInput, getGuildMemberByDiscordUserId } from '../../discord/memberDirectory';

export function createGuildMemberAccessGateway({
	guild,
	resolveFallbackMember
}: {
	guild: Guild;
	resolveFallbackMember?: (discordUserId: string) => GuildMember | null | undefined;
}) {
	return {
		findMemberByInput: (input: string) =>
			findGuildMemberByInput({
				guild,
				input
			}),
		getMember: async (discordUserId: string) => {
			const fallbackMember = resolveFallbackMember?.(discordUserId);
			if (fallbackMember) {
				return fallbackMember;
			}

			return getGuildMemberByDiscordUserId({
				guild,
				discordUserId
			});
		},
		listMembers: () => listGuildMembers({ guild })
	};
}
