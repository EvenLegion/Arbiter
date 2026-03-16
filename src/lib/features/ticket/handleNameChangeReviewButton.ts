import type { ButtonInteraction } from 'discord.js';

import { createInteractionResponder } from '../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../discord/interactionPreflight';
import type { ExecutionContext } from '../../logging/executionContext';
import type { ParsedNameChangeReviewButton } from './nameChangeReviewButtons';
import { handleApprovedNameChangeReview } from './handleApprovedNameChangeReview';
import { handleDeniedNameChangeReview } from './handleDeniedNameChangeReview';
import { openNameChangeReviewEditModal } from './openNameChangeReviewEditModal';

type HandleNameChangeReviewButtonParams = {
	interaction: ButtonInteraction;
	parsedNameChangeReviewButton: ParsedNameChangeReviewButton;
	context: ExecutionContext;
};

export async function handleNameChangeReviewButton({ interaction, parsedNameChangeReviewButton, context }: HandleNameChangeReviewButtonParams) {
	const caller = 'handleNameChangeReviewButton';
	const logger = context.logger.child({
		caller,
		nameChangeRequestId: parsedNameChangeReviewButton.requestId,
		action: parsedNameChangeReviewButton.action
	});
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild while reviewing name change request',
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
		logMessage: 'Failed to resolve reviewer member while reviewing name change request',
		failureMessage: 'Could not resolve your member record in this server.',
		capabilityRequirement: 'staff',
		resolveDbUser: parsedNameChangeReviewButton.action !== 'edit',
		dbUserFailureMessage: 'Could not resolve your database user. Please contact TECH with:',
		unauthorizedMessage: 'Only staff members can review name change requests.',
		discordTag: interaction.user.tag
	});
	if (!reviewer) {
		return;
	}

	if (parsedNameChangeReviewButton.action === 'edit') {
		await openNameChangeReviewEditModal({
			interaction,
			requestId: parsedNameChangeReviewButton.requestId,
			reviewerActor: reviewer.actor,
			logger,
			responder
		});
		return;
	}

	if (parsedNameChangeReviewButton.action === 'approve') {
		await handleApprovedNameChangeReview({
			interaction,
			requestId: parsedNameChangeReviewButton.requestId,
			guild,
			context,
			logger,
			responder,
			reviewer
		});
		return;
	}

	await handleDeniedNameChangeReview({
		interaction,
		requestId: parsedNameChangeReviewButton.requestId,
		guild,
		context,
		logger,
		responder,
		reviewer
	});
}
