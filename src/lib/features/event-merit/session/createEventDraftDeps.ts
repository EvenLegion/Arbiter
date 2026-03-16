import type { ForumChannel, Guild, TextChannel } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { postDraftEventTrackingSummary } from '../gateways/trackingSummaryGateway';
import { postEventDraftAnnouncement } from '../gateways/timelinePostingGateway';
import { createDraftVoiceChannelGateway } from './createDraftVoiceChannelGateway';
import { createEventDraftRepositoryGateway } from './createEventDraftRepositoryGateway';
import { createTrackingThreadGateway } from './createTrackingThreadGateway';

export function createEventDraftDeps({
	guild,
	trackingChannel,
	logger
}: {
	guild: Guild;
	trackingChannel: TextChannel | ForumChannel;
	logger: ExecutionContext['logger'];
}) {
	const repository = createEventDraftRepositoryGateway();
	const voiceChannels = createDraftVoiceChannelGateway({
		guild,
		logger
	});
	const trackingThreads = createTrackingThreadGateway({
		trackingChannel,
		logger
	});

	return {
		findEventTier: repository.findEventTier,
		renamePrimaryVoiceChannel: voiceChannels.renamePrimaryVoiceChannel,
		createTrackingThread: trackingThreads.createTrackingThread,
		createDraftEventSession: repository.createDraftEventSession,
		saveEventThreadChannel: repository.saveEventThreadChannel,
		postTrackingSummary: async ({
			eventSessionId,
			eventName,
			tierName,
			tierMeritAmount,
			hostDiscordUserId,
			primaryVoiceChannelId,
			trackingThreadId
		}: {
			eventSessionId: number;
			eventName: string;
			tierName: string;
			tierMeritAmount: number;
			hostDiscordUserId: string;
			primaryVoiceChannelId: string;
			trackingThreadId: string;
		}) =>
			postDraftEventTrackingSummary({
				guild,
				eventSessionId,
				eventName,
				tierName,
				tierMeritAmount,
				hostDiscordUserId,
				primaryVoiceChannelId,
				trackingThreadId,
				logger
			}),
		postThreadAnnouncement: async ({
			threadId,
			actorDiscordUserId,
			eventName
		}: {
			threadId: string;
			actorDiscordUserId: string;
			eventName: string;
		}) =>
			postEventDraftAnnouncement({
				guild,
				threadId,
				actorDiscordUserId,
				eventName
			}),
		saveTrackingMessageRef: repository.saveTrackingMessageRef,
		saveParentVoiceSummaryMessageRef: repository.saveParentVoiceSummaryMessageRef,
		cleanupTrackingThread: trackingThreads.cleanupTrackingThread
	};
}
