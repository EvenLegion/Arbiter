import { type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { DivisionKind } from '@prisma/client';

import { listCachedDivisions } from '../../../discord/guild/divisions';
import { createInteractionResponder } from '../../../discord/interactions/interactionResponder';
import type { ExecutionContext } from '../../../logging/executionContext';
import { buildDivisionSelectionMessage } from '../../division-selection/presentation/buildDivisionSelectionMessage';

type HandlePostDivisionSelectionMessageParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handlePostDivisionSelectionMessage({ interaction, context }: HandlePostDivisionSelectionMessageParams) {
	const caller = 'handlePostDivisionSelectionMessage';
	const logger = context.logger.child({ caller });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	await responder.deferReply({ flags: MessageFlags.Ephemeral });

	const channel = interaction.channel;
	if (!channel) {
		await responder.safeEditReply({
			content: `Channel not found. Please notify TECH with: discordChannelId=${interaction.channelId}`
		});
		return;
	}

	if (!channel.isSendable()) {
		await responder.safeEditReply({
			content: `Unable to send messages to this channel. Please notify TECH with: discordChannelId=${interaction.channelId}`
		});
		return;
	}

	try {
		const divisionSelectionMessage = buildDivisionSelectionMessage({
			divisions: await listCachedDivisions({
				kinds: [DivisionKind.NAVY, DivisionKind.MARINES, DivisionKind.SUPPORT]
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

		await responder.safeEditReply({
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

		await responder.safeEditReply({
			content: `Failed to post division selection message: ${errorMessage}`
		});
	}
}
