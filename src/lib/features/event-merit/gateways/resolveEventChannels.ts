import type { Guild, GuildBasedChannel, VoiceBasedChannel } from 'discord.js';

import { getGuildChannel, getVoiceBasedGuildChannel } from '../../../discord/configuredGuildGateway';

export async function resolveEventGuildChannel(guild: Guild, channelId: string): Promise<GuildBasedChannel | null> {
	return getGuildChannel({
		guild,
		channelId
	});
}

export async function resolveEventVoiceChannel(guild: Guild, channelId: string): Promise<VoiceBasedChannel | null> {
	return getVoiceBasedGuildChannel({
		guild,
		channelId
	});
}
