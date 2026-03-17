import { createInteractionResponder } from '../../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../../discord/interactionPreflight';
import type { ExecutionContext } from '../../../logging/executionContext';
import type { ParsedEventStartButton } from './parseEventStartButton';
import { activateDraftEvent, cancelDraftEvent, endActiveEvent } from '../../../services/event-lifecycle/eventLifecycleService';
import { createTransitionEventSessionDeps } from './eventLifecycleTransitionAdapters';
import { presentEventStartButtonResult } from './eventStartButtonResultPresenter';

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

	const response = presentEventStartButtonResult({
		action: parsedEventStartButton.action,
		result,
		requestId: context.requestId
	});
	if (response.delivery === 'fail') {
		await responder.fail(response.content);
		return;
	}
	if (response.followUp) {
		await responder.safeFollowUp(response.followUp);
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

	if (result.kind === 'ended') {
		logger.info(
			{
				eventSessionId: result.eventSession.id,
				actorDiscordUserId: interaction.user.id
			},
			'Ended active event session from end button'
		);
	}
}
