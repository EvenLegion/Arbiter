import { EventSessionChannelKind, EventSessionMessageKind } from '@prisma/client';
import type { ForumChannel, Guild, TextChannel } from 'discord.js';

import { eventRepository } from '../../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../../logging/executionContext';
import { postEventDraftAnnouncement } from '../../gateways/postEventDraftAnnouncement';
import { postDraftEventTrackingSummaryPresentation } from '../../presentation/syncEventTrackingPresentation';
import { createVoiceChannelGateway } from '../shared/voiceChannelGateway';
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
	const voiceChannels = createVoiceChannelGateway({
		guild,
		logger
	});
	const trackingThreads = createTrackingThreadGateway({
		trackingChannel,
		logger
	});

	return {
		findEventTier: async (eventTierId: number) =>
			eventRepository.getEventTierById({
				where: {
					id: eventTierId
				}
			}),
		renamePrimaryVoiceChannel: async ({ channelId, name, reason }: { channelId: string; name: string; reason: string }) => {
			const primaryVoiceChannel = await voiceChannels.resolveVoiceChannel(channelId);
			if (!primaryVoiceChannel) {
				return;
			}

			await primaryVoiceChannel.setName(name, reason).catch((renameErr: unknown) => {
				logger.error(
					{
						err: renameErr,
						primaryVoiceChannelId: channelId
					},
					'Failed to rename primary voice channel for event draft'
				);
			});
		},
		createTrackingThread: trackingThreads.createTrackingThread,
		createDraftEventSession: async (params: {
			hostDbUserId: string;
			eventTierId: number;
			threadId: string;
			name: string;
			primaryChannelId: string;
			addedByDbUserId: string;
		}) => eventRepository.createDraftSession(params),
		saveEventThreadChannel: async ({
			eventSessionId,
			threadId,
			addedByDbUserId
		}: {
			eventSessionId: number;
			threadId: string;
			addedByDbUserId: string;
		}) => {
			await eventRepository.upsertSessionChannel({
				eventSessionId,
				channelId: threadId,
				kind: EventSessionChannelKind.EVENT_THREAD,
				addedByDbUserId
			});
		},
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
			postDraftEventTrackingSummaryPresentation({
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
		saveTrackingMessageRef: async ({
			eventSessionId,
			channelId,
			messageId
		}: {
			eventSessionId: number;
			channelId: string;
			messageId: string;
		}) => {
			await eventRepository.upsertSessionMessageRef({
				eventSessionId,
				kind: EventSessionMessageKind.TRACKING_SUMMARY,
				channelId,
				messageId
			});
		},
		saveParentVoiceSummaryMessageRef: async ({
			eventSessionId,
			channelId,
			messageId
		}: {
			eventSessionId: number;
			channelId: string;
			messageId: string;
		}) => {
			await eventRepository.upsertSessionMessageRef({
				eventSessionId,
				kind: EventSessionMessageKind.TRACKING_SUMMARY_PARENT_VC,
				channelId,
				messageId
			});
		},
		cleanupTrackingThread: trackingThreads.cleanupTrackingThread
	};
}
