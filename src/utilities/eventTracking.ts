import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { Utility } from '@sapphire/plugin-utilities-store';
import type { Guild } from 'discord.js';

import { ENV_DISCORD } from '../config/env/discord';
import { eventRepository } from '../integrations/prisma/repositories';
import { applyTrackingTick, listActiveTrackingSessionIds, stopTrackingSession } from '../integrations/redis/eventTracking';
import type { ExecutionContext } from '../lib/logging/executionContext';
import { createChildExecutionContext } from '../lib/logging/executionContext';
import { MissingTrackedChannelWarningStore } from './eventTracking/missingTrackedChannelWarningStore';
import { reconcileTrackedSessions } from './eventTracking/reconcileTrackedSessions';
import { resolveTrackedAttendeeDiscordUserIds } from './eventTracking/resolveTrackedAttendees';
import type { ActiveTrackedEventSession } from './eventTracking/eventTrackingTypes';

type TickAllActiveSessionsParams = {
	context: ExecutionContext;
};

export class EventTrackingUtility extends Utility {
	private readonly missingTrackedChannelWarnings = new MissingTrackedChannelWarningStore();

	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'eventTracking'
		});
	}

	public async tickAllActiveSessions({ context }: TickAllActiveSessionsParams) {
		const logger = context.logger.child({ caller: 'EventTrackingUtility.tickAllActiveSessions' });
		const eventSessionIds = await listActiveTrackingSessionIds();
		this.missingTrackedChannelWarnings.reconcileActiveSessionIds({
			activeEventSessionIds: eventSessionIds
		});
		if (eventSessionIds.length === 0) {
			logger.trace('No active event sessions in Redis');
			return;
		}

		const activeSessions = await eventRepository.listSessions({
			eventSessionIds,
			states: [EventSessionState.ACTIVE],
			include: {
				channels: true
			}
		});
		const { activeSessionById, staleEventSessionIds } = reconcileTrackedSessions({
			eventSessionIds,
			activeSessions
		});
		const guild = await this.container.utilities.guild.getOrThrow();

		for (const eventSessionId of staleEventSessionIds) {
			await stopTrackingSession({
				eventSessionId
			});
			this.missingTrackedChannelWarnings.clearSession({
				eventSessionId
			});
			logger.warn(
				{
					eventSessionId
				},
				'Stopped stale Redis tracking session (not active in database)'
			);
		}

		for (const eventSessionId of eventSessionIds) {
			const session = activeSessionById.get(eventSessionId);
			if (!session) {
				continue;
			}

			const tickContext = createChildExecutionContext({
				context,
				bindings: {
					eventSessionId
				}
			});
			await this.tickSession({
				guild,
				session,
				context: tickContext
			});
		}
	}

	private async tickSession({ guild, session, context }: { guild: Guild; session: ActiveTrackedEventSession; context: ExecutionContext }) {
		const logger = context.logger.child({ caller: 'EventTrackingUtility.tickSession' });
		const trackedVoiceChannelIds = session.channels
			.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
			.map((channel) => channel.channelId);

		const attendeeDiscordUserIds = await resolveTrackedAttendeeDiscordUserIds({
			guild,
			eventSessionId: session.id,
			trackedVoiceChannelIds,
			context,
			warningStore: this.missingTrackedChannelWarnings,
			resolveVoiceChannel: ({ guild: resolvedGuild, channelId }) =>
				this.container.utilities.guild
					.getVoiceBasedChannelOrThrow({
						guild: resolvedGuild,
						channelId
					})
					.catch(() => null)
		});

		const result = await applyTrackingTick({
			eventSessionId: session.id,
			attendeeDiscordUserIds,
			tickDurationSeconds: ENV_DISCORD.EVENT_TRACKING_INTERVAL_SECONDS
		});

		logger.trace(
			{
				eventSessionId: session.id,
				trackedVoiceChannelCount: trackedVoiceChannelIds.length,
				attendeeCount: attendeeDiscordUserIds.length,
				applied: result.applied
			},
			'Applied event tracking tick'
		);
	}
}

declare module '@sapphire/plugin-utilities-store' {
	interface Utilities {
		eventTracking: EventTrackingUtility;
	}
}
