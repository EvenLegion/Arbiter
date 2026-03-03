import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { Utility } from '@sapphire/plugin-utilities-store';
import type { Guild } from 'discord.js';

import { ENV_DISCORD } from '../config/env/discord';
import { findManyEventSessions } from '../integrations/prisma';
import { applyTrackingTick, listActiveTrackingSessionIds, stopTrackingSession } from '../integrations/redis/eventTracking';
import type { ExecutionContext } from '../lib/logging/executionContext';
import { createChildExecutionContext } from '../lib/logging/executionContext';

type TickAllActiveSessionsParams = {
	context: ExecutionContext;
};

type ActiveEventSession = Awaited<
	ReturnType<
		typeof findManyEventSessions<{
			channels: true;
		}>
	>
>[number];

export class EventTrackingUtility extends Utility {
	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'eventTracking'
		});
	}

	public async tickAllActiveSessions({ context }: TickAllActiveSessionsParams) {
		const logger = context.logger.child({ caller: 'EventTrackingUtility.tickAllActiveSessions' });
		const eventSessionIds = await listActiveTrackingSessionIds();
		if (eventSessionIds.length === 0) {
			logger.trace('No active event sessions in Redis');
			return;
		}

		const activeSessions = await findManyEventSessions({
			eventSessionIds,
			states: [EventSessionState.ACTIVE],
			include: {
				channels: true
			}
		});
		const activeSessionById = new Map(activeSessions.map((session) => [session.id, session]));
		const guild = await this.container.utilities.guild.getOrThrow();

		for (const eventSessionId of eventSessionIds) {
			const session = activeSessionById.get(eventSessionId);
			if (!session) {
				await stopTrackingSession({
					eventSessionId
				});
				logger.warn(
					{
						eventSessionId
					},
					'Stopped stale Redis tracking session (not active in database)'
				);
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

	private async tickSession({ guild, session, context }: { guild: Guild; session: ActiveEventSession; context: ExecutionContext }) {
		const logger = context.logger.child({ caller: 'EventTrackingUtility.tickSession' });
		const trackedVoiceChannelIds = session.channels
			.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
			.map((channel) => channel.channelId);

		const attendeeDiscordUserIds = await this.resolveAttendeeDiscordUserIds({
			guild,
			trackedVoiceChannelIds,
			context
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

	private async resolveAttendeeDiscordUserIds({
		guild,
		trackedVoiceChannelIds,
		context
	}: {
		guild: Guild;
		trackedVoiceChannelIds: string[];
		context: ExecutionContext;
	}) {
		const logger = context.logger.child({ caller: 'EventTrackingUtility.resolveAttendeeDiscordUserIds' });
		const attendeeDiscordUserIds = new Set<string>();

		for (const channelId of trackedVoiceChannelIds) {
			try {
				const channel = await this.container.utilities.guild.getVoiceBasedChannelOrThrow({
					guild,
					channelId
				});

				for (const member of channel.members.values()) {
					if (member.user.bot) {
						continue;
					}

					attendeeDiscordUserIds.add(member.id);
				}
			} catch (err) {
				logger.warn(
					{
						channelId,
						err
					},
					'Tracked event channel is missing or not voice-based'
				);
				continue;
			}
		}

		return [...attendeeDiscordUserIds];
	}
}

declare module '@sapphire/plugin-utilities-store' {
	interface Utilities {
		eventTracking: EventTrackingUtility;
	}
}
