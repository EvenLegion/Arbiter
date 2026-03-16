import type { ModalSubmitInteraction } from 'discord.js';

import { createInteractionResponder } from '../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../discord/interactionPreflight';
import type { ExecutionContext } from '../../logging/executionContext';
import { editPendingNameChangeRequest } from '../../services/name-change/nameChangeService';
import { type ParsedNameChangeReviewModal } from './nameChangeReviewButtons';
import { NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID } from './nameChangeReviewPresenter';
import { createEditPendingNameChangeRequestDeps, syncEditedNameChangeThread } from './nameChangeServiceAdapters';

type HandleNameChangeReviewEditModalParams = {
	interaction: ModalSubmitInteraction;
	parsedNameChangeReviewModal: ParsedNameChangeReviewModal;
	context: ExecutionContext;
};

export async function handleNameChangeReviewEditModal({ interaction, parsedNameChangeReviewModal, context }: HandleNameChangeReviewEditModalParams) {
	const caller = 'handleNameChangeReviewEditModal';
	const logger = context.logger.child({
		caller,
		nameChangeRequestId: parsedNameChangeReviewModal.requestId
	});
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	await responder.deferEphemeralReply();

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild while editing name change request',
		failureMessage: 'This action can only be used in a server.'
	});
	if (!guild) {
		return;
	}

	const reviewer = await resolveInteractionActor({
		guild,
		discordUserId: interaction.user.id,
		responder,
		logger,
		logMessage: 'Failed to resolve reviewer member while editing name change request',
		failureMessage: 'Could not resolve your member record in this server.',
		capabilityRequirement: 'staff',
		resolveDbUser: false,
		unauthorizedMessage: 'Only staff members can edit name change requests.'
	});
	if (!reviewer) {
		return;
	}

	const rawRequestedName = interaction.fields.getTextInputValue(NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID).trim();
	let editResult: Awaited<ReturnType<typeof editPendingNameChangeRequest>>;
	try {
		editResult = await editPendingNameChangeRequest(
			createEditPendingNameChangeRequestDeps({
				guild,
				context
			}),
			{
				actor: {
					discordUserId: interaction.user.id,
					dbUserId: null,
					capabilities: {
						isStaff: reviewer.actor.capabilities.isStaff,
						isCenturion: false
					}
				},
				requestId: parsedNameChangeReviewModal.requestId,
				rawRequestedName
			}
		);
	} catch (error) {
		logger.error(
			{
				err: error,
				nameChangeRequestId: parsedNameChangeReviewModal.requestId
			},
			'Failed to edit pending name change request'
		);
		await responder.fail('Could not validate edited requested name. Please contact TECH with:', {
			requestId: true
		});
		return;
	}

	if (editResult.kind === 'forbidden') {
		await responder.fail('Only staff members can edit name change requests.');
		return;
	}
	if (editResult.kind === 'not_found' || editResult.kind === 'already_reviewed') {
		await responder.fail('This request has already been reviewed.');
		return;
	}
	if (editResult.kind === 'invalid_requested_name') {
		await responder.safeEditReply({
			content: editResult.errorMessage
		});
		return;
	}
	if (editResult.kind === 'requester_member_not_found') {
		await responder.fail('Could not resolve requester member for validation. Please contact TECH with:', {
			requestId: true
		});
		return;
	}
	if (editResult.kind === 'nickname_too_long') {
		await responder.safeEditReply({
			content: 'Edited requested name is too long after organization formatting/rank is applied. Please choose a shorter name.'
		});
		return;
	}
	if (editResult.kind === 'validation_failed') {
		await responder.fail('Could not validate edited requested name. Please contact TECH with:', {
			requestId: true
		});
		return;
	}

	await syncEditedNameChangeThread({
		message: interaction.message,
		channel: interaction.channel,
		channelId: interaction.channelId,
		requestId: editResult.requestId,
		previousRequestedName: editResult.previousRequestedName,
		requestedName: editResult.requestedName,
		reviewerDiscordUserId: interaction.user.id,
		logger
	});

	logger.info(
		{
			nameChangeRequestId: parsedNameChangeReviewModal.requestId,
			reviewerDiscordUserId: interaction.user.id,
			oldRequestedName: editResult.previousRequestedName,
			newRequestedName: editResult.requestedName
		},
		'Edited pending name change request requested name'
	);

	await interaction.deleteReply().catch(() => null);
}
