import { EventSessionState } from '@prisma/client';
import type { ButtonInteraction, Guild } from 'discord.js';

import { startTrackingSession, stopTrackingSession } from '../../../../../integrations/redis/eventTracking';
import { eventRepository } from '../../../../../integrations/prisma/repositories';
import { createChildExecutionContext, type ExecutionContext } from '../../../../logging/executionContext';
import { EVENT_LIFECYCLE_SESSION_INCLUDE, type EventLifecycleEventSession } from '../../../../services/event-lifecycle';
import { postEndedEventFeedbackLinks } from '../../gateways/postEndedEventFeedbackLinks';
import { syncEventLifecyclePresentation } from '../../presentation/syncEventLifecyclePresentation';
import { initializeEventReview } from '../../review/initialization/initializeEventReview';
import { createVoiceChannelGateway } from '../shared/voiceChannelGateway';

export function createEventSessionTransitionRuntime({
	guild,
	interaction,
	context,
	logger
}: {
	guild: Guild;
	interaction: ButtonInteraction;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	const voiceChannels = createVoiceChannelGateway({
		guild,
		logger
	});
	const loadEventSession = (eventSessionId: number) =>
		eventRepository.getSession({
			eventSessionId,
			include: EVENT_LIFECYCLE_SESSION_INCLUDE
		});

	return {
		findEventSession: loadEventSession,
		updateState: updateEventSessionState,
		reloadEventSession: loadEventSession,
		syncLifecyclePresentation: ({ eventSession, actorDiscordUserId }: { eventSession: EventLifecycleEventSession; actorDiscordUserId: string }) =>
			syncEventLifecyclePresentation({
				interaction,
				guild,
				eventSession,
				actorDiscordUserId,
				logger
			}),
		startTracking: async ({ eventSessionId, startedAtMs }: { eventSessionId: number; startedAtMs: number }) => {
			await startTrackingSession({
				eventSessionId,
				guildId: guild.id,
				startedAtMs
			});
		},
		stopTracking: async ({ eventSessionId }: { eventSessionId: number }) => {
			await stopTrackingSession({
				eventSessionId
			});
		},
		renameParentVoiceChannel: ({ channelId, name, reason }: { channelId: string; name: string; reason: string }) =>
			voiceChannels.renameVoiceChannel({
				channelId,
				name,
				reason,
				missingChannelLogMessage: 'Parent VC not found while attempting post-event rename',
				renameFailureLogMessage: 'Failed to rename parent VC after event end'
			}),
		postEndedEventFeedbackLinks: ({ eventSession }: { eventSession: EventLifecycleEventSession }) =>
			postEndedEventFeedbackLinks({
				guild,
				eventSession,
				logger
			}),
		initializeReview: ({ eventSessionId }: { eventSessionId: number }) =>
			initializeEventReviewSafely({
				guild,
				eventSessionId,
				context,
				logger
			}),
		now: () => new Date()
	};
}

function updateEventSessionState(params: {
	eventSessionId: number;
	fromState: EventSessionState;
	toState: Extract<EventSessionState, 'ACTIVE' | 'CANCELLED' | 'ENDED_PENDING_REVIEW'>;
	data?: Record<string, Date | string>;
}) {
	if (params.toState === EventSessionState.ACTIVE) {
		return eventRepository.updateSessionState({
			eventSessionId: params.eventSessionId,
			fromState: params.fromState,
			toState: EventSessionState.ACTIVE,
			data: {
				startedAt: params.data?.startedAt as Date
			}
		});
	}

	if (params.toState === EventSessionState.ENDED_PENDING_REVIEW) {
		return eventRepository.updateSessionState({
			eventSessionId: params.eventSessionId,
			fromState: params.fromState,
			toState: EventSessionState.ENDED_PENDING_REVIEW,
			data: {
				endedAt: params.data?.endedAt as Date
			}
		});
	}

	return eventRepository.updateSessionState({
		eventSessionId: params.eventSessionId,
		fromState: params.fromState,
		toState: EventSessionState.CANCELLED
	});
}

async function initializeEventReviewSafely({
	guild,
	eventSessionId,
	context,
	logger
}: {
	guild: Guild;
	eventSessionId: number;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	const initialized = await initializeEventReview({
		guild,
		eventSessionId,
		context: createChildExecutionContext({
			context,
			bindings: {
				step: 'initializeEventReview'
			}
		})
	})
		.then(() => true)
		.catch((error: unknown) => {
			logger.error(
				{
					err: error,
					eventSessionId
				},
				'Failed to initialize post-event review flow'
			);
			return false;
		});

	return {
		initialized
	};
}
