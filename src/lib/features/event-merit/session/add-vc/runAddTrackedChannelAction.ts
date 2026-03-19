import type { VoiceBasedChannel, Guild } from 'discord.js';
import { EventSessionChannelKind } from '@prisma/client';

import { eventRepository } from '../../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../../logging/executionContext';
import { EVENT_LIFECYCLE_SESSION_INCLUDE, addTrackedChannel } from '../../../../services/event-lifecycle';
import { postChildVcAddedTimelineMessage } from '../../gateways/postChildVcAddedTimelineMessage';
import { postPublicAddVcTimelineMessages } from '../../gateways/postPublicAddVcTimelineMessages';
import { syncEventTrackingSummaryPresentation } from '../../presentation/syncEventTrackingPresentation';
import { createVoiceChannelGateway } from '../shared/voiceChannelGateway';
import { presentEventAddVcResult } from './eventAddVcResultPresenter';

export async function runAddTrackedChannelAction({
	guild,
	targetVoiceChannel,
	logger,
	input
}: {
	guild: Guild;
	targetVoiceChannel: VoiceBasedChannel | null;
	logger: ExecutionContext['logger'];
	input: Parameters<typeof addTrackedChannel>[1];
}) {
	const voiceChannels = createVoiceChannelGateway({
		guild,
		logger,
		fallbackVoiceChannel: targetVoiceChannel
	});

	const result = await addTrackedChannel(
		{
			findEventSession: (eventSessionId: number) =>
				eventRepository.getSession({
					eventSessionId,
					include: EVENT_LIFECYCLE_SESSION_INCLUDE
				}),
			findReservedChannelReservation: async ({ channelId, excludeEventSessionId }: { channelId: string; excludeEventSessionId: number }) =>
				eventRepository.getReservedVoiceChannelReservation({
					channelId,
					excludeEventSessionId
				}),
			upsertTrackedChannel: async (params: {
				eventSessionId: number;
				channelId: string;
				kind: EventSessionChannelKind;
				addedByDbUserId: string;
			}) => {
				await eventRepository.upsertSessionChannel(params);
			},
			renameVoiceChannel: ({ channelId, name, reason }: { channelId: string; name: string; reason: string }) =>
				voiceChannels.renameVoiceChannel({
					channelId,
					name,
					reason,
					missingChannelLogMessage: 'Skipped rename because target voice channel could not be resolved',
					renameFailureLogMessage: 'Failed to rename child voice channel during event add-vc',
					logBindings: {
						voiceChannelId: channelId
					}
				}),
			syncTrackingSummary: async (eventSession: Parameters<typeof syncEventTrackingSummaryPresentation>[0]['eventSession']) => {
				await syncEventTrackingSummaryPresentation({
					guild,
					eventSession,
					logger
				});
			},
			postEventThreadLog: async ({
				threadId,
				eventName,
				actorDiscordUserId,
				channelId,
				parentVoiceChannelId
			}: {
				threadId: string;
				eventName: string;
				actorDiscordUserId: string;
				channelId: string;
				parentVoiceChannelId: string | null;
			}) =>
				postChildVcAddedTimelineMessage({
					guild,
					threadId,
					eventName,
					actorDiscordUserId,
					channelId,
					parentVoiceChannelId,
					logger
				}),
			postPublicAnnouncement: async ({
				parentVoiceChannelId,
				childVoiceChannelId,
				content,
				eventSessionId
			}: {
				parentVoiceChannelId: string | null;
				childVoiceChannelId: string;
				content: string;
				eventSessionId: number;
			}) =>
				postPublicAddVcTimelineMessages({
					guild,
					parentVoiceChannelId,
					childVoiceChannelId,
					childVoiceChannel: targetVoiceChannel,
					content,
					eventSessionId,
					logger
				})
		},
		input
	);

	return presentEventAddVcResult(result);
}
