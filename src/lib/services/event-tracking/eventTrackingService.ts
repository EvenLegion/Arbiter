import { EventSessionChannelKind, EventSessionState, type Prisma } from '@prisma/client';
import type { Guild } from 'discord.js';

import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import type { MissingTrackedChannelWarningStore } from './missingTrackedChannelWarningStore';
import { resolveTrackedAttendeeDiscordUserIds } from './resolveTrackedAttendees';

export type ActiveTrackedEventSession = Prisma.EventGetPayload<{
	include: {
		channels: true;
	};
}>;

export type EventTrackingServiceDeps = {
	listActiveTrackingSessionIds: () => Promise<number[]>;
	listActiveSessions: (params: { eventSessionIds: number[] }) => Promise<ActiveTrackedEventSession[]>;
	stopTrackingSession: (params: { eventSessionId: number }) => Promise<void>;
	resolveGuild: () => Promise<Guild>;
	resolveVoiceChannel: (params: { guild: Guild; channelId: string }) => Promise<{
		members: Map<string, { id: string; user: { bot: boolean } }>;
	} | null>;
	applyTrackingTick: (params: { eventSessionId: number; attendeeDiscordUserIds: string[]; tickDurationSeconds: number }) => Promise<{
		applied: boolean;
	}>;
	tickDurationSeconds: number;
	warningStore: MissingTrackedChannelWarningStore;
};

export type TickAllActiveEventTrackingSessionsResult = {
	activeSessionIds: number[];
	staleEventSessionIds: number[];
	tickedSessionCount: number;
};

export type TickTrackedEventSessionResult = {
	eventSessionId: number;
	trackedVoiceChannelCount: number;
	attendeeCount: number;
	applied: boolean;
};

export type TickTrackedEventSessionInput = {
	guild: Guild;
	session: ActiveTrackedEventSession;
	context: ExecutionContext;
};

export async function tickTrackedEventSession(
	deps: Pick<EventTrackingServiceDeps, 'resolveVoiceChannel' | 'applyTrackingTick' | 'tickDurationSeconds' | 'warningStore'>,
	{ guild, session, context }: TickTrackedEventSessionInput
): Promise<TickTrackedEventSessionResult> {
	const logger = context.logger.child({ caller: 'tickTrackedEventSession' });
	const trackedVoiceChannelIds = session.channels
		.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
		.map((channel) => channel.channelId);

	const attendeeDiscordUserIds = await resolveTrackedAttendeeDiscordUserIds({
		guild,
		eventSessionId: session.id,
		trackedVoiceChannelIds,
		context,
		warningStore: deps.warningStore,
		resolveVoiceChannel: deps.resolveVoiceChannel
	});

	const result =
		session.state === EventSessionState.ACTIVE
			? await deps.applyTrackingTick({
					eventSessionId: session.id,
					attendeeDiscordUserIds,
					tickDurationSeconds: deps.tickDurationSeconds
				})
			: {
					applied: false
				};

	logger.trace(
		{
			eventSessionId: session.id,
			trackedVoiceChannelCount: trackedVoiceChannelIds.length,
			attendeeCount: attendeeDiscordUserIds.length,
			applied: result.applied
		},
		'Applied event tracking tick'
	);

	return {
		eventSessionId: session.id,
		trackedVoiceChannelCount: trackedVoiceChannelIds.length,
		attendeeCount: attendeeDiscordUserIds.length,
		applied: result.applied
	};
}

export async function tickAllActiveEventTrackingSessions(
	deps: EventTrackingServiceDeps,
	{ context }: { context: ExecutionContext }
): Promise<TickAllActiveEventTrackingSessionsResult> {
	const logger = context.logger.child({ caller: 'tickAllActiveEventTrackingSessions' });
	const activeSessionIds = await deps.listActiveTrackingSessionIds();

	deps.warningStore.reconcileActiveSessionIds({
		activeEventSessionIds: activeSessionIds
	});
	if (activeSessionIds.length === 0) {
		logger.trace('No active event sessions in Redis');
		return {
			activeSessionIds,
			staleEventSessionIds: [],
			tickedSessionCount: 0
		};
	}

	const activeSessions = await deps.listActiveSessions({
		eventSessionIds: activeSessionIds
	});
	const { activeSessionById, staleEventSessionIds } = reconcileTrackedSessions({
		eventSessionIds: activeSessionIds,
		activeSessions
	});
	const guild = await deps.resolveGuild();

	for (const eventSessionId of staleEventSessionIds) {
		await deps.stopTrackingSession({
			eventSessionId
		});
		deps.warningStore.clearSession({
			eventSessionId
		});
		logger.warn(
			{
				eventSessionId
			},
			'Stopped stale Redis tracking session (not active in database)'
		);
	}

	let tickedSessionCount = 0;
	for (const eventSessionId of activeSessionIds) {
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
		await tickTrackedEventSession(deps, {
			guild,
			session,
			context: tickContext
		});
		tickedSessionCount += 1;
	}

	return {
		activeSessionIds,
		staleEventSessionIds,
		tickedSessionCount
	};
}

function reconcileTrackedSessions({ eventSessionIds, activeSessions }: { eventSessionIds: number[]; activeSessions: ActiveTrackedEventSession[] }) {
	const activeSessionById = new Map(activeSessions.map((session) => [session.id, session]));

	return {
		activeSessionById,
		staleEventSessionIds: eventSessionIds.filter((eventSessionId) => !activeSessionById.has(eventSessionId))
	};
}
