import { EventSessionChannelKind } from '@prisma/client';
import { container } from '@sapphire/framework';
import type { Guild, VoiceBasedChannel } from 'discord.js';

import { eventRepository } from '../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../logging/executionContext';
import { syncEventTrackingSummary } from '../gateways/trackingSummaryGateway';
import { postChildVcAddedTimelineMessage, postPublicAddVcTimelineMessages } from '../gateways/timelinePostingGateway';

export function createAddTrackedChannelDeps({
	guild,
	targetVoiceChannel,
	logger
}: {
	guild: Guild;
	targetVoiceChannel: VoiceBasedChannel | null;
	logger: ExecutionContext['logger'];
}) {
	return {
		findEventSession: async (eventSessionId: number) =>
			eventRepository.getSession({
				eventSessionId,
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
		renameVoiceChannel: async ({ channelId, name, reason }: { channelId: string; name: string; reason: string }) => {
			const channel =
				targetVoiceChannel?.id === channelId
					? targetVoiceChannel
					: await container.utilities.guild
							.getVoiceBasedChannelOrThrow({
								guild,
								channelId
							})
							.catch(() => null);
			if (!channel) {
				logger.warn(
					{
						voiceChannelId: channelId
					},
					'Skipped rename because target voice channel could not be resolved'
				);
				return;
			}

			await channel.setName(name, reason).catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						voiceChannelId: channelId
					},
					'Failed to rename child voice channel during event add-vc'
				);
			});
		},
		syncTrackingSummary: async (eventSession: Parameters<typeof syncEventTrackingSummary>[0]['eventSession']) => {
			await syncEventTrackingSummary({
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
	};
}
