import { EventSessionChannelKind, EventSessionState } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import type { EventLifecycleEventSession } from './eventLifecycleTypes';

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

	const isNewChildChannel = await persistTrackedChannelAddition(deps, input, validation);
	return runTrackedChannelAdditionSideEffects(deps, input, validation, isNewChildChannel);
}

async function loadAndValidateTrackedChannelAddition(
	deps: Pick<AddTrackedChannelDeps, 'findEventSession' | 'findReservedChannelReservation'>,
	input: AddTrackedChannelWorkflowInput
): Promise<ValidatedTrackedChannelAddition | { result: AddTrackedChannelResult }> {
	if (!input.actor.dbUserId) {
		return {
			result: {
				kind: 'actor_not_found'
			}
		};
	}

	const eventSession = await deps.findEventSession(input.eventSessionId);
	if (!eventSession) {
		return {
			result: {
				kind: 'event_not_found'
			}
		};
	}
	if (eventSession.state !== EventSessionState.DRAFT && eventSession.state !== EventSessionState.ACTIVE) {
		return {
			result: {
				kind: 'invalid_state',
				currentState: eventSession.state
			}
		};
	}

	const existingChannelRow = eventSession.channels.find((channel) => channel.channelId === input.targetVoiceChannelId);
	const parentVoiceChannelId = eventSession.channels.find((channel) => channel.kind === EventSessionChannelKind.PARENT_VC)?.channelId ?? null;
	if (existingChannelRow?.kind === EventSessionChannelKind.PARENT_VC) {
		return {
			result: {
				kind: 'parent_channel_already_tracked',
				channelId: input.targetVoiceChannelId,
				eventName: eventSession.name
			}
		};
	}

	if (!existingChannelRow) {
		const reservation = await deps.findReservedChannelReservation({
			channelId: input.targetVoiceChannelId,
			excludeEventSessionId: eventSession.id
		});
		if (reservation) {
			return {
				result: {
					kind: 'channel_reserved',
					channelId: input.targetVoiceChannelId,
					eventSessionId: reservation.eventSessionId,
					eventName: reservation.eventSession.name,
					state: reservation.eventSession.state
				}
			};
		}
	}

	return {
		eventSession,
		parentVoiceChannelId,
		existingChannelKind: existingChannelRow?.kind ?? null
	};
}

async function persistTrackedChannelAddition(
	deps: Pick<AddTrackedChannelDeps, 'upsertTrackedChannel' | 'renameVoiceChannel' | 'findEventSession' | 'syncTrackingSummary'>,
	input: AddTrackedChannelWorkflowInput,
	validated: Pick<ValidatedTrackedChannelAddition, 'eventSession' | 'existingChannelKind'>
) {
	const isNewChildChannel = validated.existingChannelKind === null;

	if (isNewChildChannel && input.actor.dbUserId) {
		await deps.upsertTrackedChannel({
			eventSessionId: validated.eventSession.id,
			channelId: input.targetVoiceChannelId,
			kind: EventSessionChannelKind.CHILD_VC,
			addedByDbUserId: input.actor.dbUserId
		});
	}

	if (input.renameTo && input.renameTo.trim().length > 0) {
		await deps.renameVoiceChannel({
			channelId: input.targetVoiceChannelId,
			name: input.renameTo.slice(0, 100),
			reason: buildAddTrackedChannelRenameReason({
				actorTag: input.actorTag
			})
		});
	}

	const refreshed = await deps.findEventSession(validated.eventSession.id);
	if (refreshed) {
		await deps.syncTrackingSummary(refreshed);
	}

	return isNewChildChannel;
}

async function runTrackedChannelAdditionSideEffects(
	deps: Pick<AddTrackedChannelDeps, 'postEventThreadLog' | 'postPublicAnnouncement'>,
	input: AddTrackedChannelWorkflowInput,
	validated: Pick<ValidatedTrackedChannelAddition, 'eventSession' | 'parentVoiceChannelId'>,
	isNewChildChannel: boolean
): Promise<AddTrackedChannelResult> {
	if (!isNewChildChannel) {
		return {
			kind: 'already_tracked',
			channelId: input.targetVoiceChannelId,
			eventName: validated.eventSession.name
		};
	}

	await deps.postEventThreadLog({
		threadId: validated.eventSession.threadId,
		eventName: validated.eventSession.name,
		actorDiscordUserId: input.actor.discordUserId,
		channelId: input.targetVoiceChannelId,
		parentVoiceChannelId: validated.parentVoiceChannelId
	});

	const announcement = await deps.postPublicAnnouncement({
		parentVoiceChannelId: validated.parentVoiceChannelId,
		childVoiceChannelId: input.targetVoiceChannelId,
		content: buildAddTrackedChannelAnnouncementContent({
			actorDiscordUserId: input.actor.discordUserId,
			childVoiceChannelId: input.targetVoiceChannelId,
			parentVoiceChannelId: validated.parentVoiceChannelId,
			eventName: validated.eventSession.name
		}),
		eventSessionId: validated.eventSession.id
	});

	return {
		kind: 'channel_added',
		channelId: input.targetVoiceChannelId,
		eventName: validated.eventSession.name,
		parentVoiceChannelId: validated.parentVoiceChannelId,
		announcementComplete: announcement.childPosted && announcement.parentPosted
	};
}

function buildAddTrackedChannelRenameReason({ actorTag }: { actorTag: string }) {
	return `Event add-vc by ${actorTag}`;
}

function buildAddTrackedChannelAnnouncementContent({
	actorDiscordUserId,
	childVoiceChannelId,
	parentVoiceChannelId,
	eventName
}: {
	actorDiscordUserId: string;
	childVoiceChannelId: string;
	parentVoiceChannelId: string | null;
	eventName: string;
}) {
	return `<@${actorDiscordUserId}> added <#${childVoiceChannelId}> as a sub channel under Main channel ${
		parentVoiceChannelId ? `<#${parentVoiceChannelId}>` : 'unknown Main channel'
	} for **${eventName}**.`;
}
