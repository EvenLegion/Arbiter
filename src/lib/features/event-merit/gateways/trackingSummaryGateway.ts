import { EventSessionState } from '@prisma/client';
import { container } from '@sapphire/framework';
import type { Guild, Message } from 'discord.js';

import { buildEventTrackingSummaryPayload } from '../ui/buildEventTrackingSummaryPayload';
import { syncTrackingSummaryMessage } from '../session/syncTrackingSummaryMessage';
import type { ExecutionContext } from '../../../logging/executionContext';
import type { EventLifecycleEventSession } from '../../../services/event-lifecycle/eventLifecycleTypes';

export async function syncEventTrackingSummary({
	guild,
	eventSession,
	logger
}: {
	guild: Guild;
	eventSession: EventLifecycleEventSession;
	logger: ExecutionContext['logger'];
}) {
	await syncTrackingSummaryMessage({
		guild,
		eventSession,
		logger
	});
}

export async function postDraftEventTrackingSummary({
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
	logger: ExecutionContext['logger'];
}) {
	const threadChannel = guild.channels.cache.get(trackingThreadId) ?? (await guild.channels.fetch(trackingThreadId).catch(() => null));
	if (!threadChannel || !threadChannel.isTextBased()) {
		throw new Error(`Tracking thread missing after creation: threadId=${trackingThreadId}`);
	}

	const summaryMessage = await threadChannel.send(
		buildEventTrackingSummaryPayload({
			eventSessionId,
			eventName,
			tierName,
			tierMeritAmount,
			hostDiscordUserId,
			trackedChannelIds: [primaryVoiceChannelId],
			trackingThreadId,
			state: EventSessionState.DRAFT
		})
	);

	const parentVoiceSummaryMessage = await postTrackingSummaryToParentVoiceChat({
		guild,
		primaryVoiceChannelId,
		eventSessionId,
		eventName,
		tierName,
		tierMeritAmount,
		hostDiscordUserId,
		trackedChannelIds: [primaryVoiceChannelId],
		trackingThreadId,
		logger
	});

	return {
		threadSummaryMessageId: summaryMessage.id,
		parentVoiceSummaryMessageId: parentVoiceSummaryMessage?.id ?? null
	};
}

async function postTrackingSummaryToParentVoiceChat({
	guild,
	primaryVoiceChannelId,
	eventSessionId,
	eventName,
	tierName,
	tierMeritAmount,
	hostDiscordUserId,
	trackedChannelIds,
	trackingThreadId,
	logger
}: {
	guild: Guild;
	primaryVoiceChannelId: string;
	eventSessionId: number;
	eventName: string;
	tierName: string;
	tierMeritAmount: number;
	hostDiscordUserId: string;
	trackedChannelIds: string[];
	trackingThreadId: string | null;
	logger: ExecutionContext['logger'];
}): Promise<Message | null> {
	const primaryVoiceChannel = await container.utilities.guild
		.getVoiceBasedChannelOrThrow({
			guild,
			channelId: primaryVoiceChannelId
		})
		.catch(() => null);
	if (!primaryVoiceChannel || !('send' in primaryVoiceChannel) || typeof primaryVoiceChannel.send !== 'function') {
		logger.warn(
			{
				eventSessionId,
				primaryVoiceChannelId
			},
			'Primary VC chat unavailable; skipping parent VC summary post'
		);
		return null;
	}

	return primaryVoiceChannel
		.send(
			buildEventTrackingSummaryPayload({
				eventSessionId,
				eventName,
				tierName,
				tierMeritAmount,
				hostDiscordUserId,
				trackedChannelIds,
				trackingThreadId,
				state: EventSessionState.DRAFT
			})
		)
		.catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					eventSessionId,
					primaryVoiceChannelId
				},
				'Failed to post tracking summary in parent VC chat'
			);
			return null;
		});
}
