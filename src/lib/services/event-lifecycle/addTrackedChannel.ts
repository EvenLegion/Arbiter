import { EventSessionChannelKind, EventSessionState } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import type { EventLifecycleEventSession } from './eventLifecycleTypes';
import { loadAndValidateTrackedChannelAddition } from './validateTrackedChannelAddition';
import { persistTrackedChannelAddition } from './persistTrackedChannelAddition';
import { runTrackedChannelAdditionSideEffects } from './runTrackedChannelAdditionSideEffects';

export type AddTrackedChannelDeps = {
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

export type AddTrackedChannelWorkflowInput = {
	actor: ActorContext;
	eventSessionId: number;
	targetVoiceChannelId: string;
	renameTo: string | null;
	actorTag: string;
};

export type ValidatedTrackedChannelAddition = {
	eventSession: EventLifecycleEventSession;
	parentVoiceChannelId: string | null;
	existingChannelKind: EventSessionChannelKind | null;
};

export async function addTrackedChannel(deps: AddTrackedChannelDeps, input: AddTrackedChannelWorkflowInput): Promise<AddTrackedChannelResult> {
	const validation = await loadAndValidateTrackedChannelAddition(deps, input);
	if ('result' in validation) {
		return validation.result;
	}

	const persistence = await persistTrackedChannelAddition(deps, input, validation);
	return runTrackedChannelAdditionSideEffects(deps, input, validation, persistence.isNewChildChannel);
}
