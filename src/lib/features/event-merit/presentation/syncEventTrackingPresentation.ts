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
	eventPingInProgress = false,
	logger
}: {
	guild: Guild;
	eventSession: EventTrackingPresentationSession;
	eventPingInProgress?: boolean;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
}) {
	const trackedVoiceChannelIds = eventSession.channels
		.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
		.map((channel) => channel.channelId);
	const summaryMessageRefs = await eventRepository.listSessionMessages({
		eventSessionId: eventSession.id,
		kinds: [EventSessionMessageKind.TRACKING_SUMMARY, EventSessionMessageKind.TRACKING_SUMMARY_PARENT_VC]
	});
	const buildSummaryPayload = (eventPingSentAt: Date | null) =>
		buildEventTrackingSummaryPayload({
			eventSessionId: eventSession.id,
			eventName: eventSession.name,
			tierName: eventSession.eventTier.name,
			tierMeritAmount: eventSession.eventTier.meritType.meritAmount,
			hostDiscordUserId: eventSession.hostUser.discordUserId,
			trackedChannelIds: trackedVoiceChannelIds,
			trackingThreadId: eventSession.threadId,
			state: eventSession.state,
			eventPingSentAt,
			eventPingInProgress
		});

	const initialEventPingSentAt = await loadCurrentEventPingSentAt(eventSession);
	let syncResult = await editTrackingSummaryCopies({
		guild,
		eventSessionId: eventSession.id,
		summaryMessageRefs,
		summaryPayload: buildSummaryPayload(initialEventPingSentAt),
		logger
	});
	const latestEventPingSentAt = await loadCurrentEventPingSentAt(eventSession);
	if (!sameEventPingReceipt(initialEventPingSentAt, latestEventPingSentAt)) {
		const repairResult = await editTrackingSummaryCopies({
			guild,
			eventSessionId: eventSession.id,
			summaryMessageRefs,
			summaryPayload: buildSummaryPayload(latestEventPingSentAt),
			logger
		});
		syncResult = {
			attemptedCount: syncResult.attemptedCount + repairResult.attemptedCount,
			updatedCount: syncResult.updatedCount + repairResult.updatedCount,
			failedCount: syncResult.failedCount + repairResult.failedCount
		};
	}

	return syncResult;
}

async function loadCurrentEventPingSentAt(eventSession: EventTrackingPresentationSession) {
	const currentEventSession = await eventRepository.getSession({
		eventSessionId: eventSession.id
	});
	return currentEventSession ? currentEventSession.eventPingSentAt : eventSession.eventPingSentAt;
}

function sameEventPingReceipt(left: Date | null, right: Date | null) {
	return left?.getTime() === right?.getTime();
}

async function editTrackingSummaryCopies({
	guild,
	eventSessionId,
	summaryMessageRefs,
	summaryPayload,
	logger
}: {
	guild: Guild;
	eventSessionId: number;
	summaryMessageRefs: Awaited<ReturnType<typeof eventRepository.listSessionMessages>>;
	summaryPayload: ReturnType<typeof buildEventTrackingSummaryPayload>;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
}) {
	let updatedCount = 0;
	for (const summaryRef of summaryMessageRefs) {
		const updated = await editReferencedMessage({
			guild,
			channelId: summaryRef.channelId,
			messageId: summaryRef.messageId,
			payload: summaryPayload,
			logger,
			failureLogMessage: 'Failed to sync tracking summary message',
			logBindings: {
				eventSessionId
			}
		});
		if (updated) {
			updatedCount += 1;
		}
	}

	return {
		attemptedCount: summaryMessageRefs.length,
		updatedCount,
		failedCount: summaryMessageRefs.length - updatedCount
	};
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
