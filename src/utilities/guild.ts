import { Utility } from '@sapphire/plugin-utilities-store';
import type { Guild, VoiceBasedChannel } from 'discord.js';
import { ENV_DISCORD } from '../config/env/discord';

export class GuildUtility extends Utility {
	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'guild'
		});
	}

	public async getOrThrow() {
		const guild =
			this.container.client.guilds.cache.get(ENV_DISCORD.DISCORD_GUILD_ID) ??
			(await this.container.client.guilds.fetch(ENV_DISCORD.DISCORD_GUILD_ID).catch(() => null));

		if (!guild) {
			throw new Error(`Configured guild not found: ${ENV_DISCORD.DISCORD_GUILD_ID}`);
		}

		return guild;
	}

	public async getVoiceBasedChannelOrThrow({ channelId, guild }: { channelId: string; guild?: Guild }): Promise<VoiceBasedChannel> {
		const resolvedGuild = guild ?? (await this.getOrThrow());
		const channel = resolvedGuild.channels.cache.get(channelId) ?? (await resolvedGuild.channels.fetch(channelId).catch(() => null));
		if (!channel || !channel.isVoiceBased()) {
			throw new Error(`Voice-based channel not found: guildId=${resolvedGuild.id} channelId=${channelId}`);
		}

		return channel;
	}
}

declare module '@sapphire/plugin-utilities-store' {
	interface Utilities {
		guild: GuildUtility;
	}
}
