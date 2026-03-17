import { ENV_DISCORD } from '../../config/env/discord';
import type { Guild, GuildBasedChannel, VoiceBasedChannel } from 'discord.js';
import { getRuntimeClient, getRuntimeLogger } from '../../integrations/sapphire/runtimeGateway';

export async function getConfiguredGuild() {
	const client = getRuntimeClient();
	const logger = getRuntimeLogger();

	const cachedGuild = client.guilds.cache.get(ENV_DISCORD.DISCORD_GUILD_ID);
	if (cachedGuild) {
		return cachedGuild;
	}

	const guild = await client.guilds.fetch(ENV_DISCORD.DISCORD_GUILD_ID).catch((error: unknown) => {
		logger.error(
			{
				err: error,
				discordGuildId: ENV_DISCORD.DISCORD_GUILD_ID
			},
			'Failed to fetch configured guild'
		);
		return null;
	});
	if (!guild) {
		throw new Error(`Configured guild not found: ${ENV_DISCORD.DISCORD_GUILD_ID}`);
	}

	return guild;
}

export async function getGuildChannel({ guild, channelId }: { guild: Guild; channelId: string }): Promise<GuildBasedChannel | null> {
	return guild.channels.cache.get(channelId) ?? guild.channels.fetch(channelId).catch(() => null);
}

export async function getVoiceBasedGuildChannel({ guild, channelId }: { guild: Guild; channelId: string }): Promise<VoiceBasedChannel | null> {
	const channel = await getGuildChannel({
		guild,
		channelId
	});

	return channel?.isVoiceBased() ? channel : null;
}
