import { EventSessionChannelKind, EventSessionState } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import type { EventLifecycleEventSession } from './eventLifecycleTypes';
import { isTransitionAllowed } from './eventLifecycleStateMachine';

type AddTrackedChannelDeps = {
	findEventSession: (eventSessionId: number) => Promise<EventLifecycleEventSession | null>;
	findReservedChannelReservation: (params: { channelId: string; excludeEventSessionId: number }) => Promise<{
		eventSessionId: number;
		eventSession: {
			name: string;
			state: EventSessionState;
		};
	} | null>;
	upsertTrackedChannel: (params: {
		eventSessionId: number;
		channelId: string;
		kind: EventSessionChannelKind;
		addedByDbUserId: string;
	}) => Promise<void>;
	renameVoiceChannel: (params: { channelId: string; name: string; reason: string }) => Promise<void>;
	syncTrackingSummary: (eventSession: EventLifecycleEventSession) => Promise<void>;
	postEventThreadLog: (params: {
		threadId: string;
		eventName: string;
		actorDiscordUserId: string;
		channelId: string;
		parentVoiceChannelId: string | null;
	}) => Promise<void>;
	postPublicAnnouncement: (params: {
		parentVoiceChannelId: string | null;
		childVoiceChannelId: string;
		content: string;
		eventSessionId: number;
	}) => Promise<{
		childPosted: boolean;
		parentPosted: boolean;
	}>;
};

export type AddTrackedChannelResult =
	| { kind: 'actor_not_found' }
	| { kind: 'event_not_found' }
	| { kind: 'invalid_state'; currentState: EventSessionState }
	| { kind: 'parent_channel_already_tracked'; channelId: string; eventName: string }
	| { kind: 'channel_reserved'; channelId: string; eventSessionId: number; eventName: string; state: EventSessionState }
	| { kind: 'already_tracked'; channelId: string; eventName: string }
	| {
			kind: 'channel_added';
			channelId: string;
			eventName: string;
			parentVoiceChannelId: string | null;
			announcementComplete: boolean;
	  };

export async function addTrackedChannel(
	deps: AddTrackedChannelDeps,
	input: {
		actor: ActorContext;
		eventSessionId: number;
		targetVoiceChannelId: string;
		renameTo: string | null;
		actorTag: string;
	}
): Promise<AddTrackedChannelResult> {
	if (!input.actor.dbUserId) {
		return {
			kind: 'actor_not_found'
		};
	}

	const eventSession = await deps.findEventSession(input.eventSessionId);
	if (!eventSession) {
		return {
			kind: 'event_not_found'
		};
	}
	if (!isTransitionAllowed(eventSession.state, EventSessionState.ACTIVE) && eventSession.state !== EventSessionState.DRAFT) {
		return {
			kind: 'invalid_state',
			currentState: eventSession.state
		};
	}

	const existingChannelRow = eventSession.channels.find((channel) => channel.channelId === input.targetVoiceChannelId);
	const parentVoiceChannelId = eventSession.channels.find((channel) => channel.kind === EventSessionChannelKind.PARENT_VC)?.channelId ?? null;
	if (existingChannelRow?.kind === EventSessionChannelKind.PARENT_VC) {
		return {
			kind: 'parent_channel_already_tracked',
			channelId: input.targetVoiceChannelId,
			eventName: eventSession.name
		};
	}

	const isNewChildChannel = !existingChannelRow;
	if (!existingChannelRow) {
		const reservation = await deps.findReservedChannelReservation({
			channelId: input.targetVoiceChannelId,
			excludeEventSessionId: eventSession.id
		});
		if (reservation) {
			return {
				kind: 'channel_reserved',
				channelId: input.targetVoiceChannelId,
				eventSessionId: reservation.eventSessionId,
				eventName: reservation.eventSession.name,
				state: reservation.eventSession.state
			};
		}

		await deps.upsertTrackedChannel({
			eventSessionId: eventSession.id,
			channelId: input.targetVoiceChannelId,
			kind: EventSessionChannelKind.CHILD_VC,
			addedByDbUserId: input.actor.dbUserId
		});
	}

	if (input.renameTo && input.renameTo.trim().length > 0) {
		await deps.renameVoiceChannel({
			channelId: input.targetVoiceChannelId,
			name: input.renameTo.slice(0, 100),
			reason: `Event add-vc by ${input.actorTag}`
		});
	}

	const refreshed = await deps.findEventSession(eventSession.id);
	if (refreshed) {
		await deps.syncTrackingSummary(refreshed);
	}

	if (!isNewChildChannel) {
		return {
			kind: 'already_tracked',
			channelId: input.targetVoiceChannelId,
			eventName: eventSession.name
		};
	}

	await deps.postEventThreadLog({
		threadId: eventSession.threadId,
		eventName: eventSession.name,
		actorDiscordUserId: input.actor.discordUserId,
		channelId: input.targetVoiceChannelId,
		parentVoiceChannelId
	});

	const publicMessage = `<@${input.actor.discordUserId}> added <#${input.targetVoiceChannelId}> as a sub channel under Main channel ${
		parentVoiceChannelId ? `<#${parentVoiceChannelId}>` : 'unknown Main channel'
	} for **${eventSession.name}**.`;
	const announcement = await deps.postPublicAnnouncement({
		parentVoiceChannelId,
		childVoiceChannelId: input.targetVoiceChannelId,
		content: publicMessage,
		eventSessionId: eventSession.id
	});

	return {
		kind: 'channel_added',
		channelId: input.targetVoiceChannelId,
		eventName: eventSession.name,
		parentVoiceChannelId,
		announcementComplete: announcement.childPosted && announcement.parentPosted
	};
}
