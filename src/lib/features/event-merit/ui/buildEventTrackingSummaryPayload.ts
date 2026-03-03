import { EventSessionState } from '@prisma/client';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildEventTrackingSummaryEmbed } from './buildEventTrackingSummaryEmbed';

type BuildEventTrackingSummaryPayloadParams = {
	eventSessionId: number;
	eventName: string;
	tierName: string;
	tierMeritAmount: number;
	hostDiscordUserId: string;
	trackedChannelIds: string[];
	trackingThreadId: string | null;
	state: EventSessionState;
};

export function buildEventTrackingSummaryPayload({
	eventSessionId,
	eventName,
	tierName,
	tierMeritAmount,
	hostDiscordUserId,
	trackedChannelIds,
	trackingThreadId,
	state
}: BuildEventTrackingSummaryPayloadParams) {
	const embed = buildEventTrackingSummaryEmbed({
		eventSessionId,
		eventName,
		tierName,
		tierMeritAmount,
		hostDiscordUserId,
		trackedChannelIds,
		trackingThreadId,
		state
	});

	if (state === EventSessionState.DRAFT) {
		const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(`event:start:confirm:${eventSessionId}`).setLabel('Start Event').setStyle(ButtonStyle.Success),
			new ButtonBuilder().setCustomId(`event:start:cancel:${eventSessionId}`).setLabel('Cancel Event').setStyle(ButtonStyle.Danger)
		);
		return {
			embeds: [embed],
			components: [controls]
		};
	}

	if (state === EventSessionState.ACTIVE) {
		const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(`event:start:end:${eventSessionId}`).setLabel('End Event').setStyle(ButtonStyle.Danger)
		);
		return {
			embeds: [embed],
			components: [controls]
		};
	}

	return {
		embeds: [embed],
		components: []
	};
}
