import { EventSessionChannelKind, EventSessionMessageKind, EventSessionState, DivisionKind } from '@prisma/client';
import { container } from '@sapphire/framework';
import { type ButtonInteraction, type Guild } from 'discord.js';

import {
	activateDraftEventSession,
	cancelDraftEventSession,
	findManyEventSessionMessages,
	findUniqueEventSessionById
} from '../../../../integrations/prisma';
import { startTrackingSession } from '../../../../integrations/redis/eventTracking';
import { ENV_DISCORD } from '../../../../config/env';
import type { ExecutionContext } from '../../../logging/executionContext';
import type { ParsedEventStartButton } from './parseEventStartButton';
import { buildEventStartConfirmationPayload } from '../ui/buildEventStartConfirmationPayload';
import { buildEventTrackingSummaryEmbed } from '../ui/buildEventTrackingSummaryEmbed';

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
			'Activated draft event session from start button'
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

async function syncStartConfirmationMessages({
	interaction,
	guild,
	eventSession,
	actorDiscordUserId,
	logger
}: {
	interaction: ButtonInteraction;
	guild: Guild;
	eventSession: NonNullable<Awaited<ReturnType<typeof findUniqueEventSessionById>>>;
	actorDiscordUserId: string;
	logger: ExecutionContext['logger'];
}) {
	const trackedVoiceChannelIds = eventSession.channels
		.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
		.map((channel) => channel.channelId);
	const primaryVoiceChannelId =
		eventSession.channels.find((channel) => channel.kind === EventSessionChannelKind.PARENT_VC)?.channelId ??
		trackedVoiceChannelIds[0] ??
		'unknown';

	const summaryEmbed = buildEventTrackingSummaryEmbed({
		eventSessionId: eventSession.id,
		eventName: eventSession.name,
		tierName: eventSession.eventTier.name,
		tierMeritAmount: eventSession.eventTier.meritAmount,
		hostDiscordUserId: eventSession.hostUser.discordUserId,
		trackedChannelIds: trackedVoiceChannelIds,
		trackingThreadId: eventSession.threadId,
		state: eventSession.state
	});
	const content =
		eventSession.state === EventSessionState.ACTIVE
			? `Event **${eventSession.name}** started by <@${actorDiscordUserId}>.`
			: eventSession.state === EventSessionState.CANCELLED
				? `Event draft **${eventSession.name}** was cancelled by <@${actorDiscordUserId}>.`
				: `Event **${eventSession.name}** updated to state \`${eventSession.state}\` by <@${actorDiscordUserId}>.`;

	const confirmationPayload = buildEventStartConfirmationPayload({
		eventSessionId: eventSession.id,
		eventName: eventSession.name,
		tierName: eventSession.eventTier.name,
		tierMeritAmount: eventSession.eventTier.meritAmount,
		primaryVoiceChannelId,
		trackingThreadId: eventSession.threadId
	});
	const confirmationEmbeds = eventSession.state === EventSessionState.CANCELLED ? [] : confirmationPayload.embeds;

	const confirmationMessageRefs = await findManyEventSessionMessages({
		eventSessionId: eventSession.id,
		kinds: [EventSessionMessageKind.DRAFT_CONFIRMATION, EventSessionMessageKind.ACTIVE]
	});
	const summaryMessageRefs = await findManyEventSessionMessages({
		eventSessionId: eventSession.id,
		kinds: [EventSessionMessageKind.TRACKING_SUMMARY]
	});

	await interaction.update({
		content,
		embeds: confirmationEmbeds,
		components: []
	});

	for (const summaryRef of summaryMessageRefs) {
		const channel = guild.channels.cache.get(summaryRef.channelId) ?? (await guild.channels.fetch(summaryRef.channelId).catch(() => null));
		if (!channel || !channel.isTextBased()) {
			continue;
		}

		await channel.messages
			.fetch(summaryRef.messageId)
			.then((message) =>
				message.edit({
					content: null,
					embeds: [summaryEmbed],
					components: []
				})
			)
			.catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						eventSessionId: eventSession.id,
						channelId: summaryRef.channelId,
						messageId: summaryRef.messageId
					},
					'Failed to sync tracking summary message'
				);
			});
	}

	for (const ref of confirmationMessageRefs) {
		if (ref.channelId === interaction.channelId && ref.messageId === interaction.message.id) {
			continue;
		}

		const channel = guild.channels.cache.get(ref.channelId) ?? (await guild.channels.fetch(ref.channelId).catch(() => null));
		if (!channel || !channel.isTextBased()) {
			continue;
		}

		await channel.messages
			.fetch(ref.messageId)
			.then((message) =>
				message.edit({
					content,
					embeds: confirmationEmbeds,
					components: []
				})
			)
			.catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						eventSessionId: eventSession.id,
						channelId: ref.channelId,
						messageId: ref.messageId
					},
					'Failed to sync start confirmation embed'
				);
			});
	}
}
