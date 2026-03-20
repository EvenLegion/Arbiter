import { ButtonInteraction } from 'discord.js';
import { createInteractionResponder } from '../../../../discord/interactions/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../../../discord/interactions/interactionPreflight';
import type { ExecutionContext } from '../../../../logging/executionContext';
import { dispatchEventReviewButton } from './dispatchEventReviewButton';
import type { ParsedEventReviewButton } from './eventReviewButtonProtocol';

type HandleEventReviewButtonParams = {
	interaction: ButtonInteraction;
	parsedEventReviewButton: ParsedEventReviewButton;
	context: ExecutionContext;
};

export async function handleEventReviewButton({ interaction, parsedEventReviewButton, context }: HandleEventReviewButtonParams) {
	const caller = 'handleEventReviewButton';
	const logger = context.logger.child({
		caller,
		action: parsedEventReviewButton.action,
		eventSessionId: parsedEventReviewButton.eventSessionId
	});
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	try {
		const guild = await resolveConfiguredGuild({
			interaction,
			responder,
			logger,
			logMessage: 'Failed to resolve configured guild while handling event review button',
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
			logMessage: 'Failed to resolve reviewer member while handling event review button',
			failureMessage: 'Could not resolve your member record in this server.',
			capabilityRequirement: 'staff-or-centurion',
			resolveDbUser: parsedEventReviewButton.action === 'submit',
			dbUserFailureMessage: 'Could not resolve your database user for review finalization.',
			unauthorizedMessage: 'Only staff or Centurions can perform this action.',
			discordTag: interaction.user.tag
		});
		if (!reviewer) {
			return;
		}

		await responder.deferUpdate();
		await dispatchEventReviewButton({
			interaction,
			parsedEventReviewButton,
			guild,
			context,
			logger,
			responder,
			reviewer
		});
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to process event review interaction'
		);
		await responder.fail('Failed to process this review action.');
	}
}
