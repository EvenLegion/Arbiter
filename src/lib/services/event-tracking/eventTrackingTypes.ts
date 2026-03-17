import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../logging/executionContext';
import type { ActiveTrackedEventSession } from './eventTrackingModel';
import type { MissingTrackedChannelWarningStore } from './missingTrackedChannelWarningStore';

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

export type TrackedVoiceChannelKind = Extract<EventSessionChannelKind, 'PARENT_VC' | 'CHILD_VC'>;
export type TrackableEventState = Extract<EventSessionState, 'ACTIVE'>;
