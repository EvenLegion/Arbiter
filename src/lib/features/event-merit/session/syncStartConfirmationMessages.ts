import { EventSessionChannelKind, EventSessionState, type Prisma } from '@prisma/client';
import { type ButtonInteraction, type Guild } from 'discord.js';
import type { ExecutionContext } from '../../../logging/executionContext';
import { syncTrackingSummaryMessage } from './syncTrackingSummaryMessage';

type EventSessionWithRelations = Prisma.EventSessionGetPayload<{
	include: {
		hostUser: true;
		eventTier: {
			include: {
				meritType: true;
			};
		};
		channels: true;
		eventMessages: true;
	};
}>;

export async function syncStartConfirmationMessages({
	interaction,
	guild,
	eventSession,
	actorDiscordUserId,
	logger
}: {
	interaction: ButtonInteraction;
	guild: Guild;
	eventSession: EventSessionWithRelations;
	actorDiscordUserId: string;
	logger: ExecutionContext['logger'];
}) {
	const trackedVoiceChannelIds = eventSession.channels
		.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
		.map((channel) => channel.channelId);

	if (eventSession.state === EventSessionState.ACTIVE) {
		await syncTimelineStatusMessages({
			interaction,
			guild,
			eventSession,
			trackedVoiceChannelIds,
			timelineMessage: `Event **${eventSession.name}** started by <@${actorDiscordUserId}>.`,
			timelineLogContext: 'started',
			logger
		});
		return;
	}

	if (eventSession.state === EventSessionState.CANCELLED) {
		await syncTimelineStatusMessages({
			interaction,
			guild,
			eventSession,
			trackedVoiceChannelIds,
			timelineMessage: `Event draft **${eventSession.name}** was cancelled by <@${actorDiscordUserId}>.`,
			timelineLogContext: 'cancelled',
			logger
		});
		return;
	}

	if (eventSession.state === EventSessionState.ENDED_PENDING_REVIEW) {
		await syncTimelineStatusMessages({
			interaction,
			guild,
			eventSession,
			trackedVoiceChannelIds,
			timelineMessage: `Event **${eventSession.name}** was ended by <@${actorDiscordUserId}> and moved to review.`,
			timelineLogContext: 'ended',
			logger
		});
		return;
	}

	await interaction.deferUpdate().catch((error: unknown) => {
		logger.warn(
			{
				err: error,
				eventSessionId: eventSession.id,
				state: eventSession.state
			},
			'Failed to defer interaction for unsupported event state transition'
		);
	});

	await syncTrackingSummaryMessage({
		guild,
		eventSession,
		logger
	});
}

async function syncTimelineStatusMessages({
	interaction,
	guild,
	eventSession,
	trackedVoiceChannelIds,
	timelineMessage,
	timelineLogContext,
	logger
}: {
	interaction: ButtonInteraction;
	guild: Guild;
	eventSession: EventSessionWithRelations;
	trackedVoiceChannelIds: string[];
	timelineMessage: string;
	timelineLogContext: 'started' | 'cancelled' | 'ended';
	logger: ExecutionContext['logger'];
}) {
	await interaction.deferUpdate().catch((error: unknown) => {
		logger.warn(
			{
				err: error,
				eventSessionId: eventSession.id
			},
			`Failed to defer interaction for ${timelineLogContext} event timeline sync`
		);
	});

	await syncTrackingSummaryMessage({
		guild,
		eventSession,
		logger
	});

	const timelineChannelIds = new Set<string>([eventSession.threadId, ...trackedVoiceChannelIds]);
	for (const channelId of timelineChannelIds) {
		const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
		if (!channel || !('send' in channel) || typeof channel.send !== 'function') {
			logger.warn(
				{
					eventSessionId: eventSession.id,
					channelId
				},
				`Skipped ${timelineLogContext}-event timeline post for channel without send support`
			);
			continue;
		}

		await channel.send({ content: timelineMessage }).catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					eventSessionId: eventSession.id,
					channelId
				},
				`Failed to post ${timelineLogContext}-event timeline message`
			);
		});
	}
}
