import { EmbedBuilder, type ActionRowBuilder, type ButtonBuilder } from 'discord.js';

import { buildEditedNameChangeEmbed, buildNameChangeReviewActionRow } from '../review/presentation/nameChangeReviewPresentation';
import { hasSendMethod, trimNameChangeThreadValue, type NameChangeReviewLogger, type NameChangeReviewMessage } from './nameChangeReviewThreadUtils';

export async function syncEditedNameChangeThread({
	message,
	channel,
	channelId,
	requestId,
	previousRequestedName,
	requestedName,
	reviewerDiscordUserId,
	logger
}: {
	message: NameChangeReviewMessage | null | undefined;
	channel: unknown;
	channelId: string | null;
	requestId: number;
	previousRequestedName: string;
	requestedName: string;
	reviewerDiscordUserId: string;
	logger: NameChangeReviewLogger;
}) {
	if (message) {
		const updatedEmbed = buildEditedNameChangeEmbed({
			existingEmbed: message.embeds[0] as Parameters<typeof EmbedBuilder.from>[0] | undefined,
			requestedName
		});

		await message
			.edit({
				embeds: [updatedEmbed],
				components: [buildNameChangeReviewActionRow({ requestId }) as ActionRowBuilder<ButtonBuilder>]
			})
			.catch((error: unknown) => {
				logger.error(
					{
						err: error,
						nameChangeRequestId: requestId
					},
					'Failed to update name change review message after requested name edit'
				);
			});
	}

	if (!hasSendMethod(channel)) {
		return;
	}

	await channel
		.send({
			content: `<@${reviewerDiscordUserId}> updated requested name from **${trimNameChangeThreadValue(previousRequestedName, 100)}** to **${trimNameChangeThreadValue(requestedName, 100)}**.`,
			allowedMentions: {
				parse: []
			}
		})
		.catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					channelId
				},
				'Failed to post requested-name edit message in thread'
			);
		});
}
