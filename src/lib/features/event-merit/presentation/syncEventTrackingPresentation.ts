import { EventSessionChannelKind, EventSessionMessageKind, EventSessionState, type Prisma } from '@prisma/client';
import type { Guild } from 'discord.js';

import { eventRepository } from '../../../../integrations/prisma/repositories';
import { buildEventTrackingSummaryPayload } from './shared/buildEventTrackingSummaryPayload';
import {
	editReferencedMessage,
	resolveSendCapableGuildChannel,
	resolveSendCapableVoiceChannel,
	sendMessageToChannel
} from './eventDiscordMessageGateway';

export type EventTrackingPresentationSession = Prisma.EventGetPayload<{
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

export async function syncEventTrackingSummaryPresentation({
	guild,
	eventSession,
	logger
}: {
	guild: Guild;
	eventSession: EventTrackingPresentationSession;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
}) {
	const trackedVoiceChannelIds = eventSession.channels
		.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
		.map((channel) => channel.channelId);

	const summaryPayload = buildEventTrackingSummaryPayload({
		eventSessionId: eventSession.id,
		eventName: eventSession.name,
		tierName: eventSession.eventTier.name,
		tierMeritAmount: eventSession.eventTier.meritType.meritAmount,
		hostDiscordUserId: eventSession.hostUser.discordUserId,
		trackedChannelIds: trackedVoiceChannelIds,
		trackingThreadId: eventSession.threadId,
		state: eventSession.state
	});

	const summaryMessageRefs = await eventRepository.listSessionMessages({
		eventSessionId: eventSession.id,
		kinds: [EventSessionMessageKind.TRACKING_SUMMARY, EventSessionMessageKind.TRACKING_SUMMARY_PARENT_VC]
	});

	for (const summaryRef of summaryMessageRefs) {
		await editReferencedMessage({
			guild,
			channelId: summaryRef.channelId,
			messageId: summaryRef.messageId,
			payload: summaryPayload,
			logger,
			failureLogMessage: 'Failed to sync tracking summary message',
			logBindings: {
				eventSessionId: eventSession.id
			}
		});
	}
}

export async function postDraftEventTrackingSummaryPresentation({
	guild,
	eventSessionId,
	eventName,
	tierName,
	tierMeritAmount,
	hostDiscordUserId,
	primaryVoiceChannelId,
	trackingThreadId,
	logger
}: {
	guild: Guild;
	eventSessionId: number;
	eventName: string;
	tierName: string;
	tierMeritAmount: number;
	hostDiscordUserId: string;
	primaryVoiceChannelId: string;
	trackingThreadId: string;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
}) {
	const summaryPayload = buildEventTrackingSummaryPayload({
		eventSessionId,
		eventName,
		tierName,
		tierMeritAmount,
		hostDiscordUserId,
		trackedChannelIds: [primaryVoiceChannelId],
		trackingThreadId,
		state: EventSessionState.DRAFT
	});

	const threadChannel = await resolveSendCapableGuildChannel({
		guild,
		channelId: trackingThreadId
	});
	if (!threadChannel) {
		throw new Error(`Tracking thread missing after creation: threadId=${trackingThreadId}`);
	}

	const summaryMessage = await threadChannel.send(summaryPayload);
	const parentVoiceChannel = await resolveSendCapableVoiceChannel({
		guild,
		channelId: primaryVoiceChannelId
	});
	const parentVoiceSummaryMessage = await sendMessageToChannel({
		channel: parentVoiceChannel,
		payload: summaryPayload,
		logger,
		failureLogMessage: 'Failed to post tracking summary in parent VC chat',
		logBindings: {
			eventSessionId,
			primaryVoiceChannelId
		}
	});

	return {
		threadSummaryMessageId: summaryMessage.id,
		parentVoiceSummaryMessageId: parentVoiceSummaryMessage?.id ?? null
	};
}
