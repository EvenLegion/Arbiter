import { EventSessionState } from '@prisma/client';
import { MessageFlags } from 'discord.js';

import { createInteractionResponder } from '../../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../../discord/interactionPreflight';
import type { ExecutionContext } from '../../../logging/executionContext';
import { formatEventSessionStateLabel } from '../ui/formatEventSessionStateLabel';
import type { ParsedEventStartButton } from './parseEventStartButton';
import { activateDraftEvent, cancelDraftEvent, endActiveEvent } from '../../../services/event-lifecycle/eventLifecycleService';
import { createTransitionEventSessionDeps } from './eventLifecycleTransitionAdapters';

type HandleEventStartButtonParams = {
	interaction: import('discord.js').ButtonInteraction;
	parsedEventStartButton: ParsedEventStartButton;
	context: ExecutionContext;
};

export async function handleEventStartButton({ interaction, parsedEventStartButton, context }: HandleEventStartButtonParams) {
	const caller = 'handleEventStartButton';
	const logger = context.logger.child({ caller, action: parsedEventStartButton.action, eventSessionId: parsedEventStartButton.eventSessionId });
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
		logMessage: 'Failed to resolve configured guild while handling event start button',
		failureMessage: 'This action can only be used in a server.'
	});
	if (!guild) {
		return;
	}

	const actorResult = await resolveInteractionActor({
		guild,
		discordUserId: interaction.user.id,
		responder,
		logger,
		logMessage: 'Failed to resolve actor member while handling event start button',
		failureMessage: 'Could not resolve your member record in this server.',
		capabilityRequirement: 'staff-or-centurion',
		unauthorizedMessage: 'Only staff or Centurions can perform this action.',
		discordTag: interaction.user.tag
	});
	if (!actorResult) {
		return;
	}

	const lifecycleDeps = createTransitionEventSessionDeps({
		guild,
		interaction,
		context,
		logger
	});

	const result =
		parsedEventStartButton.action === 'confirm'
			? await activateDraftEvent(lifecycleDeps, {
					actor: actorResult.actor,
					eventSessionId: parsedEventStartButton.eventSessionId
				})
			: parsedEventStartButton.action === 'end'
				? await endActiveEvent(lifecycleDeps, {
						actor: actorResult.actor,
						actorTag: interaction.user.tag,
						eventSessionId: parsedEventStartButton.eventSessionId
					})
				: await cancelDraftEvent(lifecycleDeps, {
						actor: actorResult.actor,
						eventSessionId: parsedEventStartButton.eventSessionId
					});

	if (result.kind === 'forbidden') {
		await responder.fail('Only staff or Centurions can perform this action.');
		return;
	}
	if (result.kind === 'event_not_found') {
		await responder.fail('Event session not found.');
		return;
	}
	if (result.kind === 'invalid_state') {
		const expectedState =
			parsedEventStartButton.action === 'confirm' || parsedEventStartButton.action === 'cancel'
				? EventSessionState.DRAFT
				: EventSessionState.ACTIVE;
		await responder.fail(
			`This event is no longer in ${formatEventSessionStateLabel(expectedState)} state (current state: ${formatEventSessionStateLabel(result.currentState)}).`
		);
		return;
	}
	if (result.kind === 'state_conflict') {
		await responder.fail(
			parsedEventStartButton.action === 'confirm'
				? 'Unable to start the draft event. It may have already been updated.'
				: parsedEventStartButton.action === 'end'
					? 'Unable to end the active event. It may have already been updated.'
					: 'Unable to cancel the draft event. It may have already been updated.'
		);
		return;
	}
	if (result.kind === 'event_missing_after_transition') {
		await responder.fail(
			parsedEventStartButton.action === 'confirm'
				? 'Event session not found after activation.'
				: parsedEventStartButton.action === 'end'
					? 'Event session not found after ending.'
					: 'Event session not found after cancellation.'
		);
		return;
	}

	if (result.kind === 'activated') {
		logger.info(
			{
				eventSessionId: result.eventSession.id,
				actorDiscordUserId: interaction.user.id
			},
			'Event session activated from start button'
		);
		return;
	}
	if (result.kind === 'cancelled') {
		logger.info(
			{
				eventSessionId: result.eventSession.id,
				actorDiscordUserId: interaction.user.id
			},
			'Cancelled draft event session from start button'
		);
		return;
	}

	if (result.reviewInitializationFailed) {
		await responder.safeFollowUp({
			content: `Event ended, but review initialization failed. Please contact TECH with requestId=${context.requestId}.`,
			flags: MessageFlags.Ephemeral
		});
	}

	logger.info(
		{
			eventSessionId: result.eventSession.id,
			actorDiscordUserId: interaction.user.id
		},
		'Ended active event session from end button'
	);
}
