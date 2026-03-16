import { container } from '@sapphire/framework';
import type { Guild, GuildBasedChannel, VoiceBasedChannel } from 'discord.js';

export async function resolveEventGuildChannel(guild: Guild, channelId: string): Promise<GuildBasedChannel | null> {
	return guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
}

export async function resolveEventVoiceChannel(guild: Guild, channelId: string): Promise<VoiceBasedChannel | null> {
	return container.utilities.guild
		.getVoiceBasedChannelOrThrow({
			guild,
			channelId
		})
		.catch(() => null);
}
