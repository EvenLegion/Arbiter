import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

type BuildEventStartConfirmationPayloadParams = {
	eventSessionId: number;
	eventName: string;
	tierName: string;
	tierMeritAmount: number;
	primaryVoiceChannelId: string;
	trackingThreadId: string | null;
};

export function buildEventStartConfirmationPayload({
	eventSessionId,
	eventName,
	tierName,
	tierMeritAmount,
	primaryVoiceChannelId,
	trackingThreadId
}: BuildEventStartConfirmationPayloadParams) {
	const embed = new EmbedBuilder()
		.setTitle('Start Event Confirmation')
		.setColor(0x2563eb)
		.addFields(
			{ name: 'Event Name', value: eventName, inline: true },
			{ name: 'Tier', value: `${tierName} (${tierMeritAmount} merits)`, inline: true },
			{ name: 'Primary Voice Channel', value: `<#${primaryVoiceChannelId}>`, inline: false },
			{
				name: 'Tracking Thread',
				value: trackingThreadId ? `<#${trackingThreadId}>` : 'Not available',
				inline: false
			}
		)
		.setFooter({ text: `Event session ID: ${eventSessionId}` });

	const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(`event:start:confirm:${eventSessionId}`).setLabel('Start Event').setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId(`event:start:cancel:${eventSessionId}`).setLabel('Cancel Event').setStyle(ButtonStyle.Danger)
	);

	return {
		embeds: [embed],
		components: [controls]
	};
}
