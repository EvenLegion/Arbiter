import type { ButtonInteraction } from 'discord.js';

import { ENV_DISCORD } from '../../../../../config/env';
import { createInteractionResponder } from '../../../../discord/interactions/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../../../discord/interactions/interactionPreflight';
import type { ExecutionContext } from '../../../../logging/executionContext';
import { toErrorLogFields } from '../../../../logging/errorDetails';
import { sendEventPing } from '../../../../services/event-ping';
import type { ParsedEventPingButton } from './eventPingButtonCustomId';
import { createEventPingRuntime } from './eventPingRuntime';
import { presentEventPingResult } from './eventPingResultPresenter';

export async function handleEventPingButton({
	interaction,
	parsedEventPingButton,
	context
}: {
	interaction: ButtonInteraction;
	parsedEventPingButton: ParsedEventPingButton;
	context: ExecutionContext;
}) {
	const caller = 'handleEventPingButton';
	const logger = context.logger.child({
		caller,
		eventSessionId: parsedEventPingButton.eventSessionId,
		action: parsedEventPingButton.action
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
		logMessage: 'Failed to resolve configured guild while handling Event Ping',
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
		logMessage: 'Failed to resolve actor member while handling Event Ping',
		failureMessage: 'Could not resolve your member record in this server.',
		capabilityRequirement: 'staff-or-centurion',
		unauthorizedMessage: 'Only staff or Centurions can send an Event Ping.',
		discordTag: interaction.user.tag
	});
	if (!actorResult) {
		return;
	}

	await responder.deferEphemeralReply();
	const result = await sendEventPing(
		createEventPingRuntime({
			guild,
			logger
		}),
		{
			actor: actorResult.actor,
			eventSessionId: parsedEventPingButton.eventSessionId
		}
	).catch(async (error: unknown) => {
		logger.error(
			{
				...toErrorLogFields(error),
				actorDiscordUserId: interaction.user.id,
				eventSessionId: parsedEventPingButton.eventSessionId
			},
			'event.ping.failed'
		);
		await responder.safeEditReply({
			content: `Event Ping failed unexpectedly. Please try again or contact TECH with requestId=${context.requestId}.`
		});
		return null;
	});
	if (!result) {
		return;
	}

	await responder.safeEditReply(presentEventPingResult(result, context.requestId));

	const logBindings = {
		actorDiscordUserId: interaction.user.id,
		eventSessionId: parsedEventPingButton.eventSessionId,
		resultKind: result.kind,
		secondaryFailures: result.secondaryFailures,
		destinationChannelId: ENV_DISCORD.EVENT_PING_CHANNEL_ID,
		configuredRoleId: ENV_DISCORD.EVENT_PING_ROLE_ID
	};
	if (result.kind === 'sent' && result.secondaryFailures.length === 0) {
		logger.info(logBindings, 'event.ping.succeeded');
	} else if (result.kind === 'sent' || result.kind === 'receipt_failed' || result.secondaryFailures.length > 0) {
		logger.warn(logBindings, 'event.ping.partial');
	} else if (result.kind === 'announcement_failed' || result.kind === 'coordination_unavailable') {
		logger.warn(logBindings, 'event.ping.infrastructure_failed');
	} else {
		logger.info(logBindings, 'event.ping.rejected');
	}
}
