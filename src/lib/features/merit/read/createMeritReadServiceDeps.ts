import type { Guild, GuildMember } from 'discord.js';

import { meritRepository, userRepository } from '../../../../integrations/prisma/repositories';
import { getGuildMemberByDiscordUserId } from '../../../discord/members/memberDirectory';
import type { MeritReadMember } from '../../../services/merit-read/meritReadService';

export function createMeritReadServiceDeps({ guild }: { guild: Guild }) {
	return {
		getMember: async ({ discordUserId }: { discordUserId: string }) => {
			const member = await getGuildMemberByDiscordUserId({
				guild,
				discordUserId
			});

			return member ? mapGuildMemberToMeritReadMember(member) : null;
		},
		getUser: userRepository.get,
		getUserMeritSummary: meritRepository.getUserMeritSummary
	};
}

export function mapGuildMemberToMeritReadMember(member: GuildMember): MeritReadMember {
	return {
		discordUserId: member.id,
		displayName: member.displayName,
		isBot: member.user.bot
	};
}
