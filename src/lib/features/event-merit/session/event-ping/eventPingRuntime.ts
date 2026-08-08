import { randomUUID } from 'node:crypto';

import type { Guild } from 'discord.js';

import { ENV_DISCORD } from '../../../../../config/env';
import { eventRepository } from '../../../../../integrations/prisma/repositories';
import { acquireEventSessionOperationLock, releaseEventSessionOperationLock } from '../../../../../integrations/redis/eventSessionOperationLock';
import type { EventPingServiceDeps } from '../../../../services/event-ping';
import { EVENT_LIFECYCLE_SESSION_INCLUDE } from '../../../../services/event-lifecycle';
import { toErrorLogFields } from '../../../../logging/errorDetails';
import { syncEventTrackingSummaryPresentation } from '../../presentation/syncEventTrackingPresentation';
import { postEventPingAudit, sendEventPingAnnouncement } from './eventPingDiscordGateway';

export function createEventPingRuntime({
	guild,
	logger
}: {
	guild: Guild;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
}): EventPingServiceDeps {
	return {
		findEventSession: (eventSessionId) =>
			eventRepository.getSession({
				eventSessionId,
				include: EVENT_LIFECYCLE_SESSION_INCLUDE
			}),
		acquireEventSessionOperation: async (eventSessionId) => {
			const token = randomUUID();
			return acquireEventSessionOperationLock({
				eventSessionId,
				token
			})
				.then((acquired) => (acquired ? ({ kind: 'acquired', token } as const) : ({ kind: 'busy' } as const)))
				.catch((error: unknown) => {
					logger.warn(
						{
							...toErrorLogFields(error),
							eventSessionId
						},
						'Failed to acquire event-session operation lock'
					);
					return {
						kind: 'unavailable'
					} as const;
				});
		},
		releaseEventSessionOperation: (eventSessionId, token) =>
			releaseEventSessionOperationLock({
				eventSessionId,
				token
			}).catch((error: unknown) => {
				logger.warn(
					{
						...toErrorLogFields(error),
						eventSessionId
					},
					'Failed to release event-session operation lock'
				);
				return false;
			}),
		syncSummary: async (eventSession, eventPingInProgress) => {
			const presentationSession = await eventRepository
				.getSession({
					eventSessionId: eventSession.id,
					include: EVENT_LIFECYCLE_SESSION_INCLUDE
				})
				.catch((error: unknown) => {
					logger.warn(
						{
							...toErrorLogFields(error),
							eventSessionId: eventSession.id,
							eventPingInProgress
						},
						'Failed to load event session for Event Ping summary synchronization'
					);
					return null;
				});
			if (!presentationSession) {
				return {
					failedCount: 1
				};
			}

			return syncEventTrackingSummaryPresentation({
				guild,
				eventSession: presentationSession,
				eventPingInProgress,
				logger
			}).catch((error: unknown) => {
				logger.warn(
					{
						...toErrorLogFields(error),
						eventSessionId: eventSession.id,
						eventPingInProgress
					},
					'Failed to synchronize Event Ping summary presentation'
				);
				return {
					failedCount: 1
				};
			});
		},
		sendAnnouncement: ({ eventSession, parentVoiceChannelId }) =>
			sendEventPingAnnouncement({
				guild,
				eventSession,
				parentVoiceChannelId,
				channelId: ENV_DISCORD.EVENT_PING_CHANNEL_ID,
				roleId: ENV_DISCORD.EVENT_PING_ROLE_ID,
				logger
			}),
		markEventPingSent: (params) =>
			eventRepository.markEventPingSent(params).catch((error: unknown) => {
				logger.warn(
					{
						...toErrorLogFields(error),
						eventSessionId: params.eventSessionId
					},
					'Failed to persist durable Event Ping receipt'
				);
				return false;
			}),
		postAudit: ({ eventSession, actorDiscordUserId, outcome }) =>
			postEventPingAudit({
				guild,
				eventSession,
				actorDiscordUserId,
				outcome,
				logger
			}),
		now: () => new Date()
	};
}
