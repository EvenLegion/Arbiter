import { ChannelType, TextChannel, type ForumChannel, type Guild, type Message } from 'discord.js';

import { ENV_DISCORD } from '../../../../config/env';

export type NameChangeReviewLogger = {
	error: (...values: readonly unknown[]) => void;
	warn: (...values: readonly unknown[]) => void;
};

export type NameChangeReviewMessage = Pick<Message, 'embeds' | 'edit'>;

export async function resolveBotRequestsChannel(guild: Guild, logger?: NameChangeReviewLogger): Promise<ForumChannel | TextChannel | null> {
	const channel =
		guild.channels.cache.get(ENV_DISCORD.BOT_REQUESTS_CHANNEL_ID) ??
		(await guild.channels.fetch(ENV_DISCORD.BOT_REQUESTS_CHANNEL_ID).catch((error: unknown) => {
			logger?.warn(
				{
					err: error,
					guildId: guild.id,
					channelId: ENV_DISCORD.BOT_REQUESTS_CHANNEL_ID
				},
				'Failed to fetch configured bot requests channel'
			);
			return null;
		}));
	if (!channel) {
		return null;
	}

	if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildText) {
		return channel;
	}

	return null;
}

export function getNameChangeReviewStaffRoleIds() {
	return [...new Set([ENV_DISCORD.SEC_ROLE_ID, ENV_DISCORD.CMD_ROLE_ID, ENV_DISCORD.TIR_ROLE_ID])];
}

export function hasSendMethod(value: unknown): value is {
	send: (options: { content: string; allowedMentions?: { parse: readonly string[] } }) => Promise<unknown>;
} {
	return typeof value === 'object' && value !== null && 'send' in value && typeof value.send === 'function';
}

export function isArchivableThread(value: unknown): value is {
	archived: boolean;
	setArchived: (archived: boolean, reason?: string) => Promise<unknown>;
} {
	return typeof value === 'object' && value !== null && 'archived' in value && 'setArchived' in value && typeof value.setArchived === 'function';
}

export function trimNameChangeThreadValue(value: string, maxLength: number) {
	const trimmed = value.trim();
	if (trimmed.length <= maxLength) {
		return trimmed;
	}

	return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}
