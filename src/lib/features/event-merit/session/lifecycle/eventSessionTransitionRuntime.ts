import { EventSessionState } from '@prisma/client';
import type { ButtonInteraction, Guild } from 'discord.js';

import { startTrackingSession, stopTrackingSession } from '../../../../../integrations/redis/eventTracking';
import { eventRepository } from '../../../../../integrations/prisma/repositories';
import { createChildExecutionContext, type ExecutionContext } from '../../../../logging/executionContext';
import type { EventLifecycleEventSession } from '../../../../services/event-lifecycle/eventLifecycleService';
import { syncEventLifecyclePresentation } from '../../presentation/syncEventLifecyclePresentation';
import { initializeEventReview } from '../../review/initialization/initializeEventReview';
import { EVENT_LIFECYCLE_SESSION_INCLUDE } from '../shared/eventLifecycleSessionInclude';
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

	return {
		findEventSession: (eventSessionId: number) =>
			eventRepository.getSession({
				eventSessionId,
				include: EVENT_LIFECYCLE_SESSION_INCLUDE
			}),
		updateState: (params: {
			eventSessionId: number;
			fromState: EventSessionState;
			toState: Extract<EventSessionState, 'ACTIVE' | 'CANCELLED' | 'ENDED_PENDING_REVIEW'>;
			data?: Record<string, Date | string>;
		}) => {
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
		},
		reloadEventSession: (eventSessionId: number) =>
			eventRepository.getSession({
				eventSessionId,
				include: EVENT_LIFECYCLE_SESSION_INCLUDE
			}),
		syncLifecyclePresentation: async ({
			eventSession,
			actorDiscordUserId
		}: {
			eventSession: EventLifecycleEventSession;
			actorDiscordUserId: string;
		}) => {
			await syncEventLifecyclePresentation({
				interaction,
				guild,
				eventSession,
				actorDiscordUserId,
				logger
			});
		},
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
		initializeReview: async ({ eventSessionId }: { eventSessionId: number }) => {
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
		},
		now: () => new Date()
	};
}
