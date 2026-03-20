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

	logger.info(
		{
			eventSessionId: input.eventSessionId,
			targetVoiceChannelId: input.targetVoiceChannelId,
			targetVoiceChannelResolvedId: targetVoiceChannel?.id ?? null,
			renameTo: input.renameTo,
			actorDiscordUserId: input.actor.discordUserId
		},
		'event.session.add_vc.lifecycle.started'
	);

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

	logger.info(buildAddTrackedChannelResultLogBindings(result), 'event.session.add_vc.lifecycle.completed');

	if (result.kind === 'channel_added' && result.announcementComplete === false) {
		logger.warn(
			{
				eventSessionId: input.eventSessionId,
				targetVoiceChannelId: input.targetVoiceChannelId,
				parentVoiceChannelId: result.parentVoiceChannelId
			},
			'event.session.add_vc.announcement_incomplete'
		);
	}

	const presented = presentEventAddVcResult(result);
	logger.info(
		{
			eventSessionId: input.eventSessionId,
			targetVoiceChannelId: input.targetVoiceChannelId,
			resultKind: result.kind,
			delivery: presented.delivery
		},
		'event.session.add_vc.lifecycle.presented'
	);

	return presented;
}

function buildAddTrackedChannelResultLogBindings(result: Awaited<ReturnType<typeof addTrackedChannel>>) {
	switch (result.kind) {
		case 'actor_not_found':
		case 'event_not_found':
			return {
				resultKind: result.kind
			};
		case 'invalid_state':
			return {
				resultKind: result.kind,
				currentState: result.currentState
			};
		case 'parent_channel_already_tracked':
		case 'already_tracked':
			return {
				resultKind: result.kind,
				channelId: result.channelId,
				eventName: result.eventName
			};
		case 'channel_reserved':
			return {
				resultKind: result.kind,
				channelId: result.channelId,
				eventName: result.eventName,
				reservedByEventSessionId: result.eventSessionId,
				reservedState: result.state
			};
		case 'channel_added':
			return {
				resultKind: result.kind,
				channelId: result.channelId,
				eventName: result.eventName,
				parentVoiceChannelId: result.parentVoiceChannelId,
				announcementComplete: result.announcementComplete
			};
	}
}
