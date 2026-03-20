import { EmbedBuilder, type ActionRowBuilder, type ButtonBuilder } from 'discord.js';

import { buildNameChangeReviewActionRow, buildReviewedNameChangeEmbed } from '../review/presentation/nameChangeReviewPresentation';
import { hasSendMethod, isArchivableThread, type NameChangeReviewLogger, type NameChangeReviewMessage } from './nameChangeReviewThreadUtils';

export async function syncReviewedNameChangeThread(params: {
	message: NameChangeReviewMessage;
	channel: unknown;
	channelId: string | null;
	requestId: number;
	requesterDiscordUserId: string;
	reviewerDiscordUserId: string;
	reviewerTag: string;
	statusLabel: string;
	decisionVerb: string;
	logger: NameChangeReviewLogger;
}) {
	const updatedEmbed = buildReviewedNameChangeEmbed({
		existingEmbed: params.message.embeds[0] as Parameters<typeof EmbedBuilder.from>[0] | undefined,
		statusLabel: params.statusLabel,
		reviewerDiscordUserId: params.reviewerDiscordUserId
	});

	await params.message
		.edit({
			embeds: [updatedEmbed],
			components: [
				buildNameChangeReviewActionRow({
					requestId: params.requestId,
					disabled: true
				}) as ActionRowBuilder<ButtonBuilder>
			]
		})
		.catch((error: unknown) => {
			params.logger.error(
				{
					err: error
				},
				'Failed to update name change review message after decision'
			);
		});

	if (hasSendMethod(params.channel)) {
		await params.channel
			.send({
				content: `<@${params.requesterDiscordUserId}>, your request was ${params.decisionVerb} by <@${params.reviewerDiscordUserId}>.`
			})
			.catch((error: unknown) => {
				params.logger.warn(
					{
						err: error,
						channelId: params.channelId
					},
					'Failed to post name change review outcome message in thread'
				);
			});
	}

	if (!isArchivableThread(params.channel) || params.channel.archived) {
		return;
	}

	await params.channel.setArchived(true, `Name change request ${params.decisionVerb} by ${params.reviewerTag}`).catch((error: unknown) => {
		params.logger.warn(
			{
				err: error,
				channelId: params.channelId,
				nameChangeRequestId: params.requestId
			},
			'Failed to archive reviewed name change request thread'
		);
	});
}
