import { EventSessionChannelKind, EventSessionState, type Prisma } from '@prisma/client';
import type { ButtonInteraction, Guild } from 'discord.js';

import { resolveSendCapableGuildChannel, sendMessageToChannel } from './eventDiscordMessageGateway';
import { syncEventTrackingSummaryPresentation } from './syncEventTrackingPresentation';

type EventSessionWithRelations = Prisma.EventGetPayload<{
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

export async function syncEventLifecyclePresentation({
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
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
}) {
	const trackedVoiceChannelIds = eventSession.channels
		.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
		.map((channel) => channel.channelId);

	await interaction.deferUpdate().catch((error: unknown) => {
		logger.warn(
			{
				err: error,
				eventSessionId: eventSession.id,
				state: eventSession.state
			},
			'Failed to defer interaction during event lifecycle presentation sync'
		);
	});

	await syncEventTrackingSummaryPresentation({
		guild,
		eventSession,
		logger
	});

	const timelineMessage = buildEventLifecycleTimelineMessage({
		state: eventSession.state,
		eventName: eventSession.name,
		actorDiscordUserId
	});
	if (!timelineMessage) {
		return;
	}

	const timelineChannelIds = new Set<string>([eventSession.threadId, ...trackedVoiceChannelIds]);
	for (const channelId of timelineChannelIds) {
		const channel = await resolveSendCapableGuildChannel({
			guild,
			channelId
		});
		if (!channel) {
			logger.warn(
				{
					eventSessionId: eventSession.id,
					channelId
				},
				'Skipped lifecycle timeline post for channel without send support'
			);
			continue;
		}

		await sendMessageToChannel({
			channel,
			payload: {
				content: timelineMessage
			},
			logger,
			failureLogMessage: 'Failed to post lifecycle timeline message',
			logBindings: {
				eventSessionId: eventSession.id
			}
		});
	}
}

function buildEventLifecycleTimelineMessage({
	state,
	eventName,
	actorDiscordUserId
}: {
	state: EventSessionState;
	eventName: string;
	actorDiscordUserId: string;
}) {
	if (state === EventSessionState.ACTIVE) {
		return `Event **${eventName}** started by <@${actorDiscordUserId}>.`;
	}
	if (state === EventSessionState.CANCELLED) {
		return `Event draft **${eventName}** was cancelled by <@${actorDiscordUserId}>.`;
	}
	if (state === EventSessionState.ENDED_PENDING_REVIEW) {
		return `Event **${eventName}** was ended by <@${actorDiscordUserId}> and moved to review.`;
	}

	return null;
}
