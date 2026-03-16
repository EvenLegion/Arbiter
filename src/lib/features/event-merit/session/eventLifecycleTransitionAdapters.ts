import { EventSessionState } from '@prisma/client';
import { container } from '@sapphire/framework';
import type { ButtonInteraction, Guild } from 'discord.js';

import { eventRepository } from '../../../../integrations/prisma/repositories';
import { createChildExecutionContext, type ExecutionContext } from '../../../logging/executionContext';
import type { EventLifecycleEventSession } from '../../../services/event-lifecycle/eventLifecycleService';
import { initializeEventReview } from '../review/initializeEventReview';
import { startEventTrackingSession, stopEventTrackingSession } from '../gateways/trackingStoreGateway';
import { syncStartConfirmationMessages } from './syncStartConfirmationMessages';

export function createTransitionEventSessionDeps({
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
		updateState: async (params: {
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
		reloadEventSession: async (eventSessionId: number) =>
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
		syncLifecyclePresentation: async ({
			eventSession,
			actorDiscordUserId
		}: {
			eventSession: EventLifecycleEventSession;
			actorDiscordUserId: string;
		}) => {
			await syncStartConfirmationMessages({
				interaction,
				guild,
				eventSession,
				actorDiscordUserId,
				logger
			});
		},
		startTracking: async ({ eventSessionId, startedAtMs }: { eventSessionId: number; startedAtMs: number }) => {
			await startEventTrackingSession({
				eventSessionId,
				guildId: guild.id,
				startedAtMs
			});
		},
		stopTracking: async ({ eventSessionId }: { eventSessionId: number }) => {
			await stopEventTrackingSession({
				eventSessionId
			});
		},
		renameParentVoiceChannel: async ({ channelId, name, reason }: { channelId: string; name: string; reason: string }) => {
			const parentVoiceChannel = await container.utilities.guild
				.getVoiceBasedChannelOrThrow({
					guild,
					channelId
				})
				.catch(() => null);
			if (!parentVoiceChannel) {
				logger.warn(
					{
						channelId
					},
					'Parent VC not found while attempting post-event rename'
				);
				return;
			}

			await parentVoiceChannel.setName(name, reason).catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						channelId
					},
					'Failed to rename parent VC after event end'
				);
			});
		},
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
