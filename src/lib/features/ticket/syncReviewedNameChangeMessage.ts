import { EmbedBuilder, type ActionRowBuilder, type ButtonBuilder } from 'discord.js';

import { buildNameChangeReviewActionRow, buildReviewedNameChangeEmbed } from './nameChangeReviewPresenter';
import type { NameChangeReviewLogger, NameChangeReviewMessage } from './nameChangeReviewThreadGateway.shared';

export async function syncReviewedNameChangeMessage({
	message,
	requestId,
	statusLabel,
	reviewerDiscordUserId,
	logger
}: {
	message: NameChangeReviewMessage;
	requestId: number;
	statusLabel: string;
	reviewerDiscordUserId: string;
	logger: NameChangeReviewLogger;
}) {
	const updatedEmbed = buildReviewedNameChangeEmbed({
		existingEmbed: message.embeds[0] as Parameters<typeof EmbedBuilder.from>[0] | undefined,
		statusLabel,
		reviewerDiscordUserId
	});

	await message
		.edit({
			embeds: [updatedEmbed],
			components: [
				buildNameChangeReviewActionRow({
					requestId,
					disabled: true
				}) as ActionRowBuilder<ButtonBuilder>
			]
		})
		.catch((error: unknown) => {
			logger.error(
				{
					err: error
				},
				'Failed to update name change review message after decision'
			);
		});
}
