import { EventSessionState } from '@prisma/client';

import { ENV_DISCORD } from '../../../../config/env/discord';
import { eventRepository } from '../../../../integrations/prisma/repositories';
import { getConfiguredGuild, getVoiceBasedGuildChannel } from '../../../discord/guild/configuredGuild';
import { applyTrackingTick, listActiveTrackingSessionIds, stopTrackingSession } from '../../../../integrations/redis/eventTracking';
import { MissingTrackedChannelWarningStore } from '../../../services/event-tracking/missingTrackedChannelWarningStore';

const warningStore = new MissingTrackedChannelWarningStore();

export function createEventTrackingServiceDeps() {
	return {
		listActiveTrackingSessionIds,
		listActiveSessions: ({ eventSessionIds }: { eventSessionIds: number[] }) =>
			eventRepository.listSessions({
				eventSessionIds,
				states: [EventSessionState.ACTIVE],
				include: {
					channels: true
				}
			}),
		stopTrackingSession: async ({ eventSessionId }: { eventSessionId: number }) => {
			await stopTrackingSession({
				eventSessionId
			});
		},
		resolveGuild: getConfiguredGuild,
		resolveVoiceChannel: ({ guild, channelId }: { guild: Parameters<typeof getVoiceBasedGuildChannel>[0]['guild']; channelId: string }) =>
			getVoiceBasedGuildChannel({
				guild,
				channelId
			}),
		applyTrackingTick,
		tickDurationSeconds: ENV_DISCORD.EVENT_TRACKING_INTERVAL_SECONDS,
		warningStore
	};
}
