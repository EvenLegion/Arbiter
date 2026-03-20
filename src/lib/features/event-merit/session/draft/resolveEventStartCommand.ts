import { ChannelType, type ForumChannel, type Guild, type GuildMember, type TextChannel } from 'discord.js';
import { z } from 'zod';

import { ENV_DISCORD } from '../../../../../config/env/discord';
import { getGuildChannel } from '../../../../discord/guild/configuredGuild';
import { getDbUserOrThrow } from '../../../../discord/guild/users';

const EVENT_TIER_ID_SCHEMA = z.coerce.number().int().positive();

type EventStartInteraction = {
	options: {
		getString: (name: string, required?: boolean) => string | null;
	};
	user: {
		id: string;
		tag: string;
	};
};

export type ResolvedEventStartCommand =
	| {
			kind: 'ready';
			trackingChannel: TextChannel | ForumChannel;
			createDraftInput: {
				hostDbUserId: string;
				hostDiscordUserId: string;
				issuerTag: string;
				eventTierId: number;
				eventName: string;
				primaryVoiceChannelId: string;
			};
	  }
	| {
			kind: 'fail';
			delivery: 'editReply' | 'fail';
			content: string;
			requestId?: boolean;
	  };

export async function resolveEventStartCommand({
	interaction,
	guild,
	issuer,
	logger
}: {
	interaction: EventStartInteraction;
	guild: Guild;
	issuer: GuildMember;
	logger: {
		error: (...values: readonly unknown[]) => void;
	};
}): Promise<ResolvedEventStartCommand> {
	const primaryVoiceChannelId = issuer.voice.channelId;
	if (!primaryVoiceChannelId) {
		return {
			kind: 'fail',
			delivery: 'editReply',
			content: 'You must be in a voice channel to start an event.'
		};
	}

	const rawEventTierId = interaction.options.getString('tier_level', true);
	const parsedEventTierId = EVENT_TIER_ID_SCHEMA.safeParse(rawEventTierId);
	if (!parsedEventTierId.success) {
		return {
			kind: 'fail',
			delivery: 'editReply',
			content: 'Invalid event tier selection.'
		};
	}

	const eventName = interaction.options.getString('event_name', true)?.trim() ?? '';
	if (eventName.length === 0) {
		return {
			kind: 'fail',
			delivery: 'editReply',
			content: 'Event name is required.'
		};
	}

	const trackingChannel = await resolveTrackingChannel(guild);
	if (!trackingChannel) {
		logger.error(
			{
				trackingChannelId: ENV_DISCORD.EVENT_TRACKING_CHANNEL_ID
			},
			'Configured event tracking channel not found or unsupported type'
		);
		return {
			kind: 'fail',
			delivery: 'editReply',
			content: `Configured event tracking channel not found or unsupported type: <#${ENV_DISCORD.EVENT_TRACKING_CHANNEL_ID}>`
		};
	}

	const dbUser = await getDbUserOrThrow({
		discordUserId: interaction.user.id
	});

	return {
		kind: 'ready',
		trackingChannel,
		createDraftInput: {
			hostDbUserId: dbUser.id,
			hostDiscordUserId: issuer.id,
			issuerTag: interaction.user.tag,
			eventTierId: parsedEventTierId.data,
			eventName,
			primaryVoiceChannelId
		}
	};
}

async function resolveTrackingChannel(guild: Guild): Promise<TextChannel | ForumChannel | null> {
	const channel = await getGuildChannel({
		guild,
		channelId: ENV_DISCORD.EVENT_TRACKING_CHANNEL_ID
	});

	if (!channel) {
		return null;
	}

	if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildForum) {
		return channel;
	}

	return null;
}
