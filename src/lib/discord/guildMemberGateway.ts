import type { Guild, GuildMember } from 'discord.js';

export async function getGuildMember({ guild, discordUserId }: { guild: Guild; discordUserId: string }) {
	return guild.members.cache.get(discordUserId) ?? guild.members.fetch(discordUserId).catch(() => null);
}

export async function getGuildMemberOrThrow({ guild, discordUserId }: { guild: Guild; discordUserId: string }) {
	const member = await getGuildMember({
		guild,
		discordUserId
	});
	if (!member) {
		throw new Error(`Guild member not found: guildId=${guild.id} discordUserId=${discordUserId}`);
	}

	return member;
}

export function listGuildMembers({ guild }: { guild: Guild }): Promise<Map<string, GuildMember>> {
	return guild.members.fetch();
}
