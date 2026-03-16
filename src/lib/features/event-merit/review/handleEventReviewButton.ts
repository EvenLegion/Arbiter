import { EventSessionState } from '@prisma/client';
import { ButtonInteraction } from 'discord.js';
import { createInteractionResponder } from '../../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../../discord/interactionPreflight';
import type { ExecutionContext } from '../../../logging/executionContext';
import type { ParsedEventReviewButton } from './parseEventReviewButton';
import { formatEventSessionStateLabel } from '../ui/formatEventSessionStateLabel';
import { finalizeEventReviewLifecycle } from '../../../services/event-lifecycle/eventLifecycleService';
import { recordEventReviewDecision, refreshEventReviewPage } from '../../../services/event-review/eventReviewService';
import {
	createFinalizeEventReviewLifecycleDeps,
	createRecordEventReviewDecisionDeps,
	createRefreshEventReviewPageDeps
} from './eventReviewServiceAdapters';

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

		if (parsedEventReviewButton.action === 'page') {
			const pageResult = await refreshEventReviewPage(
				createRefreshEventReviewPageDeps({
					guild,
					logger
				}),
				{
					eventSessionId: parsedEventReviewButton.eventSessionId,
					page: parsedEventReviewButton.page
				}
			);
			if (pageResult.kind === 'event_not_found') {
				await responder.fail('Event session not found.');
				return;
			}
			if (pageResult.kind === 'invalid_state') {
				await responder.fail(`Event review is not available in state ${formatEventSessionStateLabel(pageResult.currentState)}.`);
				return;
			}
			if (pageResult.kind === 'page_refreshed' && !pageResult.synced) {
				await responder.fail('Could not refresh the review message. Please try again.');
			}
			return;
		}

		if (parsedEventReviewButton.action === 'decision') {
			const result = await recordEventReviewDecision(
				createRecordEventReviewDecisionDeps({
					guild,
					logger
				}),
				{
					actor: reviewer.actor,
					eventSessionId: parsedEventReviewButton.eventSessionId,
					targetDbUserId: parsedEventReviewButton.targetDbUserId,
					decision: parsedEventReviewButton.decision,
					page: parsedEventReviewButton.page
				}
			);

			if (result.kind === 'forbidden') {
				await responder.fail('Only staff or Centurions can perform this action.');
				return;
			}
			if (result.kind === 'event_not_found') {
				await responder.fail('Event session not found.');
				return;
			}
			if (result.kind === 'invalid_state') {
				await responder.fail(`Event review is not available in state ${formatEventSessionStateLabel(result.currentState)}.`);
				return;
			}
			if (result.kind === 'review_locked') {
				await responder.fail('Review decisions are locked because this event is already finalized.');
				return;
			}
			if (!result.synced) {
				await responder.fail('Could not refresh the review message. Please try again.');
			}
			return;
		}

		const submitMode = parsedEventReviewButton.mode;
		const result = await finalizeEventReviewLifecycle(
			createFinalizeEventReviewLifecycleDeps({
				guild,
				context,
				logger
			}),
			{
				actor: reviewer.actor,
				eventSessionId: parsedEventReviewButton.eventSessionId,
				mode: submitMode
			}
		);

		if (result.kind === 'forbidden') {
			await responder.fail('Only staff or Centurions can perform this action.');
			return;
		}
		if (result.kind === 'reviewer_not_found') {
			await responder.fail('Could not resolve your database user for review finalization.');
			return;
		}
		if (result.kind === 'event_not_found') {
			await responder.fail('Event session not found.');
			return;
		}
		if (result.kind === 'invalid_state') {
			const content =
				result.currentState === EventSessionState.FINALIZED_WITH_MERITS || result.currentState === EventSessionState.FINALIZED_NO_MERITS
					? 'This event review has already been finalized.'
					: `Event review is not available in state ${formatEventSessionStateLabel(result.currentState)}.`;
			await responder.fail(content);
			return;
		}
		if (result.kind === 'state_conflict') {
			await responder.fail('Unable to finalize event review. It may have already been finalized by another reviewer.');
			return;
		}

		if (!result.reviewMessageSynced) {
			await responder.fail('Could not refresh the review message. Please try again.');
		}

		logger.info(
			{
				eventSessionId: parsedEventReviewButton.eventSessionId,
				mode: submitMode,
				awardedCount: result.awardedCount,
				toState: result.toState
			},
			'Finalized event review'
		);
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
