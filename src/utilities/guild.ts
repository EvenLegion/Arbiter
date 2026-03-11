import { Utility } from '@sapphire/plugin-utilities-store';
import type { Guild, GuildBasedChannel, VoiceBasedChannel } from 'discord.js';
import { ENV_DISCORD } from '../config/env/discord';

export class GuildUtility extends Utility {
	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'guild'
		});
	}

	public async get(): Promise<Guild | null> {
		const cachedGuild = this.container.client.guilds.cache.get(ENV_DISCORD.DISCORD_GUILD_ID);
		if (cachedGuild) {
			return cachedGuild;
		}

		return this.container.client.guilds.fetch(ENV_DISCORD.DISCORD_GUILD_ID).catch((error: unknown) => {
			this.container.logger.error(
				{
					err: error,
					discordGuildId: ENV_DISCORD.DISCORD_GUILD_ID
				},
				'Failed to fetch configured guild'
			);
			return null;
		});
	}

	public async getOrThrow() {
		const guild = await this.get();

		if (!guild) {
			throw new Error(`Configured guild not found: ${ENV_DISCORD.DISCORD_GUILD_ID}`);
		}

		return guild;
	}

	public async getVoiceBasedChannelOrThrow({ channelId, guild }: { channelId: string; guild?: Guild }): Promise<VoiceBasedChannel> {
		const resolvedGuild = guild ?? (await this.getOrThrow());
		let channel: GuildBasedChannel | null = resolvedGuild.channels.cache.get(channelId) ?? null;
		if (!channel) {
			channel = await resolvedGuild.channels.fetch(channelId).catch((error: unknown) => {
				this.container.logger.error(
					{
						err: error,
						discordGuildId: resolvedGuild.id,
						discordChannelId: channelId
					},
					'Failed to fetch voice-based channel'
				);
				return null;
			});
		}
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
