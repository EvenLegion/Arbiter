import { EventSessionState, DivisionKind } from '@prisma/client';
import { container } from '@sapphire/framework';

import {
	activateDraftEventSession,
	cancelDraftEventSession,
	endActiveEventSession,
	findUniqueEventSessionById
} from '../../../../integrations/prisma';
import { startTrackingSession, stopTrackingSession } from '../../../../integrations/redis/eventTracking';
import { ENV_DISCORD } from '../../../../config/env';
import type { ExecutionContext } from '../../../logging/executionContext';
import type { ParsedEventStartButton } from './parseEventStartButton';
import { syncStartConfirmationMessages } from './syncStartConfirmationMessages';

type HandleEventStartButtonParams = {
	interaction: import('discord.js').ButtonInteraction;
	parsedEventStartButton: ParsedEventStartButton;
	context: ExecutionContext;
};

export async function handleEventStartButton({ interaction, parsedEventStartButton, context }: HandleEventStartButtonParams) {
	const caller = 'handleEventStartButton';
	const logger = context.logger.child({ caller, action: parsedEventStartButton.action, eventSessionId: parsedEventStartButton.eventSessionId });

	if (!interaction.inGuild() || !interaction.guild) {
		await interaction.reply({
			content: 'This action can only be used in a server.',
			ephemeral: true
		});
		return;
	}
	const guild = interaction.guild;

	const eventSession = await findUniqueEventSessionById({
		eventSessionId: parsedEventStartButton.eventSessionId
	});
	if (!eventSession) {
		await interaction.reply({
			content: 'Event session not found.',
			ephemeral: true
		});
		return;
	}

	const member = await container.utilities.member
		.getOrThrow({
			guild,
			discordUserId: interaction.user.id
		})
		.catch(() => null);
	if (!member) {
		await interaction.reply({
			content: 'Could not resolve your member record in this server.',
			ephemeral: true
		});
		return;
	}

	const isStaff = await container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
		member,
		requiredRoleKinds: [DivisionKind.STAFF]
	});
	const isCenturion = await container.utilities.divisionRolePolicy.memberHasDivision({
		member,
		divisionDiscordRoleId: ENV_DISCORD.CENT_ROLE_ID
	});

	if (!isStaff && !isCenturion) {
		await interaction.reply({
			content: 'Only staff or Centurions can perform this action.',
			ephemeral: true
		});
		return;
	}

	if (parsedEventStartButton.action === 'confirm') {
		if (eventSession.state !== EventSessionState.DRAFT) {
			await interaction.reply({
				content: `This event is no longer in DRAFT state (current state: ${eventSession.state}).`,
				ephemeral: true
			});
			return;
		}

		const activated = await activateDraftEventSession({
			eventSessionId: eventSession.id,
			startedAt: new Date()
		});
		if (!activated) {
			await interaction.reply({
				content: 'Unable to start the draft event. It may have already been updated.',
				ephemeral: true
			});
			return;
		}

		await startTrackingSession({
			eventSessionId: eventSession.id,
			guildId: guild.id,
			startedAtMs: Date.now()
		});

		const refreshed = await findUniqueEventSessionById({
			eventSessionId: eventSession.id
		});
		if (!refreshed) {
			await interaction.reply({
				content: 'Event session not found after activation.',
				ephemeral: true
			});
			return;
		}

		await syncStartConfirmationMessages({
			interaction,
			guild,
			eventSession: refreshed,
			actorDiscordUserId: interaction.user.id,
			logger
		});

		logger.info(
			{
				eventSessionId: eventSession.id,
				actorDiscordUserId: interaction.user.id
			},
			'Event session activated from start button'
		);
		return;
	}

	if (parsedEventStartButton.action === 'end') {
		if (eventSession.state !== EventSessionState.ACTIVE) {
			await interaction.reply({
				content: `This event is no longer in ACTIVE state (current state: ${eventSession.state}).`,
				ephemeral: true
			});
			return;
		}

		const ended = await endActiveEventSession({
			eventSessionId: eventSession.id,
			endedAt: new Date()
		});
		if (!ended) {
			await interaction.reply({
				content: 'Unable to end the active event. It may have already been updated.',
				ephemeral: true
			});
			return;
		}

		await stopTrackingSession({
			eventSessionId: eventSession.id
		});

		const refreshed = await findUniqueEventSessionById({
			eventSessionId: eventSession.id
		});
		if (!refreshed) {
			await interaction.reply({
				content: 'Event session not found after ending.',
				ephemeral: true
			});
			return;
		}

		await syncStartConfirmationMessages({
			interaction,
			guild,
			eventSession: refreshed,
			actorDiscordUserId: interaction.user.id,
			logger
		});

		logger.info(
			{
				eventSessionId: eventSession.id,
				actorDiscordUserId: interaction.user.id
			},
			'Ended active event session from end button'
		);
		return;
	}

	if (eventSession.state !== EventSessionState.DRAFT) {
		await interaction.reply({
			content: `This event is no longer in DRAFT state (current state: ${eventSession.state}).`,
			ephemeral: true
		});
		return;
	}

	const cancelled = await cancelDraftEventSession({
		eventSessionId: eventSession.id
	});
	if (!cancelled) {
		await interaction.reply({
			content: 'Unable to cancel the draft event. It may have already been updated.',
			ephemeral: true
		});
		return;
	}

	logger.info(
		{
			eventSessionId: eventSession.id,
			actorDiscordUserId: interaction.user.id
		},
		'Cancelled draft event session from start button'
	);

	const refreshed = await findUniqueEventSessionById({
		eventSessionId: eventSession.id
	});
	if (!refreshed) {
		await interaction.reply({
			content: 'Event session not found after cancellation.',
			ephemeral: true
		});
		return;
	}

	await syncStartConfirmationMessages({
		interaction,
		guild,
		eventSession: refreshed,
		actorDiscordUserId: interaction.user.id,
		logger
	});
}
