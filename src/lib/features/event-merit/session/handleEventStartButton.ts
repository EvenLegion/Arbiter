import { EventSessionChannelKind, EventSessionState, DivisionKind } from '@prisma/client';
import { container } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';

import { findUniqueEventSession, updateEventSessionState } from '../../../../integrations/prisma';
import { startTrackingSession, stopTrackingSession } from '../../../../integrations/redis/eventTracking';
import { ENV_DISCORD } from '../../../../config/env';
import { createChildExecutionContext, type ExecutionContext } from '../../../logging/executionContext';
import { initializeEventReview } from '../review/initializeEventReview';
import { formatEventSessionStateLabel } from '../ui/formatEventSessionStateLabel';
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

	const guild = await container.utilities.guild.getOrThrow().catch((error: unknown) => {
		logger.error(
			{
				err: error
			},
			'Failed to resolve configured guild while handling event start button'
		);
		return null;
	});
	if (!guild) {
		await interaction.reply({
			content: 'This action can only be used in a server.',
			ephemeral: true
		});
		return;
	}

	const eventSession = await findUniqueEventSession({
		eventSessionId: parsedEventStartButton.eventSessionId,
		include: {
			hostUser: true,
			eventTier: {
				include: {
					meritType: true
				}
			},
			channels: true,
			eventMessages: true
		}
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
				content: `This event is no longer in ${formatEventSessionStateLabel(EventSessionState.DRAFT)} state (current state: ${formatEventSessionStateLabel(eventSession.state)}).`,
				ephemeral: true
			});
			return;
		}

		const activated = await updateEventSessionState({
			eventSessionId: eventSession.id,
			fromState: EventSessionState.DRAFT,
			toState: EventSessionState.ACTIVE,
			data: {
				startedAt: new Date()
			}
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

		const refreshed = await findUniqueEventSession({
			eventSessionId: eventSession.id,
			include: {
				hostUser: true,
				eventTier: {
					include: {
						meritType: true
					}
				},
				channels: true,
				eventMessages: true
			}
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
				content: `This event is no longer in ${formatEventSessionStateLabel(EventSessionState.ACTIVE)} state (current state: ${formatEventSessionStateLabel(eventSession.state)}).`,
				ephemeral: true
			});
			return;
		}

		const ended = await updateEventSessionState({
			eventSessionId: eventSession.id,
			fromState: EventSessionState.ACTIVE,
			toState: EventSessionState.ENDED_PENDING_REVIEW,
			data: {
				endedAt: new Date()
			}
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

		const refreshed = await findUniqueEventSession({
			eventSessionId: eventSession.id,
			include: {
				hostUser: true,
				eventTier: {
					include: {
						meritType: true
					}
				},
				channels: true,
				eventMessages: true
			}
		});
		if (!refreshed) {
			await interaction.reply({
				content: 'Event session not found after ending.',
				ephemeral: true
			});
			return;
		}

		const parentVoiceChannelId = refreshed.channels.find((channel) => channel.kind === EventSessionChannelKind.PARENT_VC)?.channelId ?? null;
		if (parentVoiceChannelId) {
			const parentVoiceChannel = await container.utilities.guild
				.getVoiceBasedChannelOrThrow({
					guild,
					channelId: parentVoiceChannelId
				})
				.catch(() => null);
			if (parentVoiceChannel) {
				await parentVoiceChannel.setName('Post Event Hangout', `Event ended by ${interaction.user.tag}`).catch((error: unknown) => {
					logger.warn(
						{
							err: error,
							eventSessionId: refreshed.id,
							parentVoiceChannelId
						},
						'Failed to rename parent VC to Post Event Hangout after event end'
					);
				});
			} else {
				logger.warn(
					{
						eventSessionId: refreshed.id,
						parentVoiceChannelId
					},
					'Parent VC not found while attempting post-event rename'
				);
			}
		}

		await syncStartConfirmationMessages({
			interaction,
			guild,
			eventSession: refreshed,
			actorDiscordUserId: interaction.user.id,
			logger
		});

		await initializeEventReview({
			guild,
			eventSessionId: refreshed.id,
			context: createChildExecutionContext({
				context,
				bindings: {
					step: 'initializeEventReview'
				}
			})
		}).catch(async (error: unknown) => {
			logger.error(
				{
					err: error,
					eventSessionId: refreshed.id
				},
				'Failed to initialize post-event review flow'
			);

			await interaction
				.followUp({
					content: `Event ended, but review initialization failed. Please contact TECH with requestId=${context.requestId}.`,
					flags: MessageFlags.Ephemeral
				})
				.catch(() => null);
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
			content: `This event is no longer in ${formatEventSessionStateLabel(EventSessionState.DRAFT)} state (current state: ${formatEventSessionStateLabel(eventSession.state)}).`,
			ephemeral: true
		});
		return;
	}

	const cancelled = await updateEventSessionState({
		eventSessionId: eventSession.id,
		fromState: EventSessionState.DRAFT,
		toState: EventSessionState.CANCELLED
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

	const refreshed = await findUniqueEventSession({
		eventSessionId: eventSession.id,
		include: {
			hostUser: true,
			eventTier: {
				include: {
					meritType: true
				}
			},
			channels: true,
			eventMessages: true
		}
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
