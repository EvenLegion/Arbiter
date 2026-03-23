import type { ModalSubmitInteraction } from 'discord.js';

import { nameChangeRepository } from '../../../../../integrations/prisma/repositories';
import { createInteractionResponder } from '../../../../discord/interactions/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../../../discord/interactions/interactionPreflight';
import type { ExecutionContext } from '../../../../logging/executionContext';
import { editPendingNameChangeRequest } from '../../../../services/name-change/nameChangeService';
import { syncEditedNameChangeThread } from '../../thread/syncEditedNameChangeThread';
import { createRequestedNicknameValidator, listNameChangeDivisionPrefixes } from '../../nameChangeWorkflowSupport';
import { type ParsedNameChangeReviewModal } from '../nameChangeReviewCustomId';
import { NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID } from '../presentation/nameChangeReviewPresentation';
import { presentNameChangeReviewEditModalResult } from '../presentation/presentNameChangeReviewEditModalResult';

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
			{
				getDivisionPrefixes: listNameChangeDivisionPrefixes,
				findRequest: nameChangeRepository.getRequest,
				validateRequestedNickname: createRequestedNicknameValidator({
					guild,
					context
				}),
				updatePendingRequestedName: (params) => nameChangeRepository.updatePendingRequestedName(params)
			},
			{
				actor: {
					discordUserId: interaction.user.id,
					dbUserId: null,
					capabilities: {
						isStaff: reviewer.actor.capabilities.isStaff,
						isCenturion: false,
						isOptio: false
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

	const presentation = presentNameChangeReviewEditModalResult(editResult);
	if (presentation.kind === 'response') {
		if (editResult.kind === 'requester_member_not_found' || editResult.kind === 'validation_failed') {
			logger.error(
				{
					nameChangeRequestId: parsedNameChangeReviewModal.requestId,
					reviewerDiscordUserId: interaction.user.id,
					editResult
				},
				'name_change.edit.failed'
			);
		}
		if (presentation.delivery === 'fail') {
			await responder.fail(presentation.content, {
				requestId: presentation.requestId
			});
			return;
		}

		await responder.safeEditReply({
			content: presentation.content
		});
		return;
	}

	await syncEditedNameChangeThread({
		message: interaction.message,
		channel: interaction.channel,
		channelId: interaction.channelId,
		requestId: presentation.threadSync.requestId,
		previousRequestedName: presentation.threadSync.previousRequestedName,
		requestedName: presentation.threadSync.requestedName,
		reviewerDiscordUserId: interaction.user.id,
		logger
	});

	logger.info(
		{
			nameChangeRequestId: parsedNameChangeReviewModal.requestId,
			reviewerDiscordUserId: interaction.user.id,
			oldRequestedName: presentation.threadSync.previousRequestedName,
			newRequestedName: presentation.threadSync.requestedName
		},
		'Edited pending name change request requested name'
	);

	await interaction.deleteReply().catch((error: unknown) => {
		logger.warn(
			{
				err: error,
				nameChangeRequestId: parsedNameChangeReviewModal.requestId,
				reviewerDiscordUserId: interaction.user.id
			},
			'Failed to delete deferred reply after editing name change request'
		);
		return null;
	});
}
