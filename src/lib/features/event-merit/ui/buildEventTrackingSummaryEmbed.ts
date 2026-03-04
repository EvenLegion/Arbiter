import { EmbedBuilder } from 'discord.js';
import { EventSessionState } from '@prisma/client';
import { formatEventSessionStateLabel } from './formatEventSessionStateLabel';

type BuildEventTrackingSummaryEmbedParams = {
	eventSessionId: number;
	eventName: string;
	tierName: string;
	tierMeritAmount: number;
	hostDiscordUserId: string;
	trackedChannelIds: string[];
	trackingThreadId: string | null;
	state: EventSessionState;
};

export function buildEventTrackingSummaryEmbed({
	eventSessionId,
	eventName,
	tierName,
	tierMeritAmount,
	hostDiscordUserId,
	trackedChannelIds,
	trackingThreadId,
	state
}: BuildEventTrackingSummaryEmbedParams) {
	const trackedChannelsValue =
		trackedChannelIds.length > 0 ? trackedChannelIds.map((channelId) => `<#${channelId}>`).join('\n') : 'No channels configured';

	return new EmbedBuilder()
		.setTitle('Event Tracking Summary')
		.setColor(0x2563eb)
		.addFields(
			{ name: 'Event Name', value: eventName, inline: false },
			{ name: 'Tier', value: `${tierName} (${tierMeritAmount} merits)`, inline: true },
			{ name: 'State', value: formatEventSessionStateLabel(state), inline: true },
			{ name: 'Host', value: `<@${hostDiscordUserId}>`, inline: true },
			{
				name: 'Tracking Thread',
				value: trackingThreadId ? `<#${trackingThreadId}>` : 'Not available',
				inline: false
			},
			{ name: 'Tracked Voice Channels', value: trackedChannelsValue, inline: false }
		)
		.setFooter({ text: `Event session ID: ${eventSessionId}` });
}
