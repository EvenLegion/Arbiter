import { type ChatInputCommandInteraction } from 'discord.js';

import { createInteractionResponder } from '../../discord/interactionResponder';
import { resolveConfiguredGuild } from '../../discord/interactionPreflight';
import type { ExecutionContext } from '../../logging/executionContext';
import { submitNameChangeRequest } from '../../services/name-change/nameChangeService';
import { createSubmitNameChangeRequestDeps } from './nameChangeServiceAdapters';
import { buildInitialNameChangeReviewEmbed } from './nameChangeTicketPresenter';
import { buildNameChangeReviewActionRow } from './nameChangeReviewPresenter';

type HandleNameChangeTicketParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleNameChangeTicket({ interaction, context }: HandleNameChangeTicketParams) {
	const caller = 'handleNameChangeTicket';
	const logger = context.logger.child({ caller });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	const rawRequestedName = interaction.options.getString('requested_name', true).trim();
	const reason = interaction.options.getString('reason', true).trim();
	if (!rawRequestedName || !reason) {
		await responder.fail('Requested name and reason are required.');
		return;
	}

	await responder.deferEphemeralReply();

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild while handling name change ticket',
		failureMessage: 'Could not resolve configured guild. Please contact TECH with:',
		requestId: true
	});
	if (!guild) {
		return;
	}

	let result: Awaited<ReturnType<typeof submitNameChangeRequest>>;
	try {
		result = await submitNameChangeRequest(
			createSubmitNameChangeRequestDeps({
				guild,
				context,
				fallbackUsername: interaction.user.username,
				buildReviewEmbed: buildInitialNameChangeReviewEmbed,
				buildReviewActionRow: ({ requestId }) => buildNameChangeReviewActionRow({ requestId })
			}),
			{
				actor: {
					discordUserId: interaction.user.id,
					dbUserId: null,
					capabilities: {
						isStaff: false,
						isCenturion: false
					}
				},
				rawRequestedName,
				reason,
				requesterTag: interaction.user.tag
			}
		);
	} catch (error) {
		logger.error(
			{
				err: error,
				discordUserId: interaction.user.id
			},
			'Failed to submit name change request'
		);
		await responder.fail('Failed to create name change request. Please contact staff with:', {
			requestId: true
		});
		return;
	}

	if (result.kind === 'requester_not_found') {
		await responder.fail('User not found in database. Please contact staff with:', {
			requestId: true
		});
		return;
	}
	if (result.kind === 'invalid_requested_name') {
		await responder.safeEditReply({
			content: result.errorMessage
		});
		return;
	}
	if (result.kind === 'requester_member_not_found') {
		await responder.fail('Could not resolve your member record. Please contact staff with:', {
			requestId: true
		});
		return;
	}
	if (result.kind === 'nickname_too_long') {
		await responder.safeEditReply({
			content:
				'Requested name is too long after organization formatting/rank is applied. Please submit a shorter name that fits Discord nickname limits.'
		});
		return;
	}
	if (result.kind === 'validation_failed') {
		await responder.fail('Could not validate requested name. Please contact staff with:', {
			requestId: true
		});
		return;
	}
	if (result.kind === 'request_creation_failed') {
		await responder.fail('Failed to create name change request. Please contact staff with:', {
			requestId: true
		});
		return;
	}
	if (result.kind === 'review_thread_failed') {
		await responder.safeEditReply({
			content: `Request created but failed to create review thread. Please contact staff with: requestId=${result.requestId}`
		});
		return;
	}
	if (result.kind === 'review_thread_reference_failed') {
		await responder.safeEditReply({
			content: `Name change request thread was created, but I could not persist its review reference. Please contact staff with: requestId=${result.requestId}`
		});
		return;
	}

	if (result.strippedDivisionPrefix) {
		logger.info(
			{
				rawRequestedName,
				normalizedRequestedName: result.requestedName,
				strippedDivisionPrefix: result.strippedDivisionPrefix
			},
			'Detected and stripped division prefix from requested name'
		);
	}

	logger.info(
		{
			nameChangeRequestId: result.requestId,
			requesterDiscordUserId: interaction.user.id,
			requestedName: result.requestedName,
			reviewThreadId: result.reviewThreadId
		},
		'Created name change ticket'
	);

	await responder.safeEditReply({
		content: `Name change request created.\nReview thread: <#${result.reviewThreadId}>${
			result.strippedDivisionPrefix ? '\nNote: I removed your division prefix from the requested name.' : ''
		}`
	});
}
