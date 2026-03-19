import type { Guild, GuildMember } from 'discord.js';
import { PINO_LOGGER } from '../../../integrations/pino';

type GuildMemberLookupLogger = {
	warn: (...values: readonly unknown[]) => void;
};

export async function getGuildMember({
	guild,
	discordUserId,
	logger = PINO_LOGGER
}: {
	guild: Guild;
	discordUserId: string;
	logger?: GuildMemberLookupLogger;
}) {
	const cachedMember = guild.members.cache.get(discordUserId);
	if (cachedMember) {
		return cachedMember;
	}

	return guild.members.fetch(discordUserId).catch((error: unknown) => {
		logger.warn(
			{
				err: error,
				guildId: guild.id,
				discordUserId
			},
			'Failed to fetch guild member'
		);
		return null;
	});
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
