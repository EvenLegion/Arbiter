import { ChannelType, type ForumChannel, type Guild, type GuildMember, type TextChannel } from 'discord.js';

import { ENV_DISCORD } from '../../../../../config/env/discord';
import { eventRepository } from '../../../../../integrations/prisma/repositories';
import { getGuildChannel } from '../../../../discord/guild/configuredGuild';
import { getDbUserOrThrow } from '../../../../discord/guild/users';

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

	const rawEventTierSelection = interaction.options.getString('tier_level', true);
	if (!rawEventTierSelection) {
		return {
			kind: 'fail',
			delivery: 'editReply',
			content: 'Invalid event tier selection.'
		};
	}

	const eventTier = await resolveSelectedEventTier(rawEventTierSelection);
	if (!eventTier) {
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
			eventTierId: eventTier.id,
			eventName,
			primaryVoiceChannelId
		}
	};
}

async function resolveSelectedEventTier(rawSelection: string) {
	const normalizedSelection = rawSelection.trim().toLowerCase();
	if (normalizedSelection.length === 0) {
		return null;
	}

	const tiers = await eventRepository.listEventTiers({
		orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }]
	});

	const exactCodeMatch = tiers.find((tier) => tier.code.toLowerCase() === normalizedSelection);
	if (exactCodeMatch) {
		return exactCodeMatch;
	}

	const exactNameMatch = tiers.find((tier) => tier.name.trim().toLowerCase() === normalizedSelection);
	if (exactNameMatch) {
		return exactNameMatch;
	}

	const tierLevelMatch = normalizedSelection.match(/^tier\s*(\d+)$/);
	if (tierLevelMatch) {
		const requestedDisplayOrder = Number.parseInt(tierLevelMatch[1] ?? '', 10);
		const displayOrderMatch = tiers.find((tier) => tier.displayOrder === requestedDisplayOrder);
		if (displayOrderMatch) {
			return displayOrderMatch;
		}
	}

	if (/^\d+$/.test(normalizedSelection)) {
		const requestedDisplayOrder = Number.parseInt(normalizedSelection, 10);
		const displayOrderMatch = tiers.find((tier) => tier.displayOrder === requestedDisplayOrder);
		if (displayOrderMatch) {
			return displayOrderMatch;
		}

		const legacyIdMatch = tiers.find((tier) => tier.id === requestedDisplayOrder);
		if (legacyIdMatch) {
			return legacyIdMatch;
		}
	}

	return tiers.find((tier) => tier.description.trim().toLowerCase() === normalizedSelection) ?? null;
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
