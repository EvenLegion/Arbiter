import type { Guild, GuildBasedChannel, VoiceBasedChannel } from 'discord.js';

import { ENV_DISCORD } from '../../../config/env/discord';
import { PINO_LOGGER } from '../../../integrations/pino';
import { getRuntimeClient } from '../../../integrations/sapphire/runtimeGateway';

export async function getConfiguredGuild() {
	const client = getRuntimeClient();

	const cachedGuild = client.guilds.cache.get(ENV_DISCORD.DISCORD_GUILD_ID);
	if (cachedGuild) {
		return cachedGuild;
	}

	try {
		return await client.guilds.fetch(ENV_DISCORD.DISCORD_GUILD_ID);
	} catch (error) {
		throw new Error(`Configured guild not found: ${ENV_DISCORD.DISCORD_GUILD_ID}`, {
			cause: error
		});
	}
}

type GuildChannelLookupLogger = {
	warn: (...values: readonly unknown[]) => void;
};

export async function getGuildChannel({
	guild,
	channelId,
	logger = PINO_LOGGER
}: {
	guild: Guild;
	channelId: string;
	logger?: GuildChannelLookupLogger;
}): Promise<GuildBasedChannel | null> {
	const cachedChannel = guild.channels.cache.get(channelId);
	if (cachedChannel) {
		return cachedChannel;
	}

	return guild.channels.fetch(channelId).catch((error: unknown) => {
		logger.warn(
			{
				err: error,
				guildId: guild.id,
				channelId
			},
			'Failed to fetch guild channel'
		);
		return null;
	});
}

export async function getVoiceBasedGuildChannel({ guild, channelId }: { guild: Guild; channelId: string }): Promise<VoiceBasedChannel | null> {
	const channel = await getGuildChannel({
		guild,
		channelId
	});

	return channel?.isVoiceBased() ? channel : null;
}
