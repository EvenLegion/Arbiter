import { type Guild, type GuildMember } from 'discord.js';

import { createGuildMemberAccessGateway } from '../../../services/guild-member/guildMemberAccessGateway';

export function createManualMeritMemberResolver({ guild, awarderMember }: { guild: Guild; awarderMember: GuildMember }) {
	const members = createGuildMemberAccessGateway({
		guild,
		resolveFallbackMember: (discordUserId) => (discordUserId === awarderMember.id ? awarderMember : null)
	});

	return {
		resolveTargetMember: async (playerInput: string) => {
			const member = await members.findMemberByInput(playerInput);
			return member ? mapMemberToResolvedMember(member) : null;
		},
		getMember: members.getMember
	};
}

export function mapMemberToResolvedMember(member: GuildMember) {
	return {
		discordUserId: member.id,
		discordUsername: member.user.username,
		discordDisplayName: member.displayName,
		discordGlobalName: member.user.globalName,
		discordAvatarUrl: member.user.displayAvatarURL(),
		isBot: member.user.bot
	};
}
