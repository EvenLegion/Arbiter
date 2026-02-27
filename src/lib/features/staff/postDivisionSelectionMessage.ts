import { type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { DivisionKind } from '@prisma/client';

import { buildDivisionSelectionMessage } from '../division-selection/buildDivisionSelectionMessage';
import { container } from '@sapphire/framework';
import type { ExecutionContext } from '../../logging/executionContext';

type HandlePostDivisionMessageParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handlePostDivisionMessage({ interaction, context }: HandlePostDivisionMessageParams) {
	const caller = 'handlePostDivisionMessage';
	const logger = context.logger.child({ caller });

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const channel = interaction.channel;
	if (!channel) {
		await interaction.editReply({
			content: `Channel not found. Please notify TECH with: discordChannelId=${interaction.channelId}`
		});
		return;
	}

	if (!channel.isSendable()) {
		await interaction.editReply({
			content: `Unable to send messages to this channel. Please notify TECH with: discordChannelId=${interaction.channelId}`
		});
		return;
	}

	try {
		const divisionSelectionMessage = buildDivisionSelectionMessage({
			divisions: await container.utilities.divisionCache.get({
				kinds: [DivisionKind.COMBAT, DivisionKind.INDUSTRIAL]
			})
		});

		const sentMessage = await channel.send(divisionSelectionMessage);

		logger.info(
			{
				messageId: sentMessage.id,
				channelId: sentMessage.channelId,
				channelName: 'name' in channel ? channel.name : channel.id,
				issuerId: interaction.user.id,
				issuerTag: interaction.user.tag
			},
			'posted division selection message to channel'
		);

		await interaction.editReply({
			content: 'Division selection message posted successfully.'
		});
	} catch (error) {
		logger.error(
			{
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				discordTag: interaction.user.tag,
				discordChannelId: interaction.channelId,
				err: error
			},
			'Failed to post division selection message'
		);

		const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'An unknown error occurred';

		await interaction.editReply({
			content: `Failed to post division selection message: ${errorMessage}`
		});
	}
}
