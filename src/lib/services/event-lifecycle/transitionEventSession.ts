import { EventSessionChannelKind, EventSessionState } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import type { EventLifecycleEventSession } from './eventLifecycleTypes';
import { isTransitionAllowed } from './eventLifecycleStateMachine';

type TransitionEventSessionDeps = {
	findEventSession: (eventSessionId: number) => Promise<EventLifecycleEventSession | null>;
	updateState: (params: {
		eventSessionId: number;
		fromState: EventSessionState;
		toState: Extract<EventSessionState, 'ACTIVE' | 'CANCELLED' | 'ENDED_PENDING_REVIEW'>;
		data?: Record<string, Date | string>;
	}) => Promise<boolean>;
	reloadEventSession: (eventSessionId: number) => Promise<EventLifecycleEventSession | null>;
	syncLifecyclePresentation: (params: { eventSession: EventLifecycleEventSession; actorDiscordUserId: string }) => Promise<void>;
	startTracking?: (params: { eventSessionId: number; startedAtMs: number }) => Promise<void>;
	stopTracking?: (params: { eventSessionId: number }) => Promise<void>;
	renameParentVoiceChannel?: (params: { channelId: string; name: string; reason: string }) => Promise<void>;
	initializeReview?: (params: { eventSessionId: number }) => Promise<{ initialized: boolean }>;
	now: () => Date;
};

export type TransitionEventSessionResult =
	| { kind: 'forbidden' }
	| { kind: 'event_not_found' }
	| { kind: 'invalid_state'; currentState: EventSessionState }
	| { kind: 'state_conflict' }
	| { kind: 'event_missing_after_transition' }
	| { kind: 'activated'; eventSession: EventLifecycleEventSession }
	| { kind: 'cancelled'; eventSession: EventLifecycleEventSession }
	| { kind: 'ended'; eventSession: EventLifecycleEventSession; reviewInitializationFailed: boolean };

export async function activateDraftEvent(
	deps: TransitionEventSessionDeps,
	input: {
		actor: ActorContext;
		eventSessionId: number;
	}
): Promise<TransitionEventSessionResult> {
	return transitionEventSession(deps, {
		actor: input.actor,
		eventSessionId: input.eventSessionId,
		fromState: EventSessionState.DRAFT,
		toState: EventSessionState.ACTIVE
	});
}

export async function cancelDraftEvent(
	deps: TransitionEventSessionDeps,
	input: {
		actor: ActorContext;
		eventSessionId: number;
	}
): Promise<TransitionEventSessionResult> {
	return transitionEventSession(deps, {
		actor: input.actor,
		eventSessionId: input.eventSessionId,
		fromState: EventSessionState.DRAFT,
		toState: EventSessionState.CANCELLED
	});
}

export async function endActiveEvent(
	deps: TransitionEventSessionDeps,
	input: {
		actor: ActorContext;
		actorTag: string;
		eventSessionId: number;
	}
): Promise<TransitionEventSessionResult> {
	return transitionEventSession(deps, {
		actor: input.actor,
		actorTag: input.actorTag,
		eventSessionId: input.eventSessionId,
		fromState: EventSessionState.ACTIVE,
		toState: EventSessionState.ENDED_PENDING_REVIEW
	});
}

async function transitionEventSession(
	deps: TransitionEventSessionDeps,
	input: {
		actor: ActorContext;
		eventSessionId: number;
		fromState: EventSessionState;
		toState: Extract<EventSessionState, 'ACTIVE' | 'CANCELLED' | 'ENDED_PENDING_REVIEW'>;
		actorTag?: string;
	}
): Promise<TransitionEventSessionResult> {
	if (!input.actor.capabilities.isStaff && !input.actor.capabilities.isCenturion) {
		return {
			kind: 'forbidden'
		};
	}

	const eventSession = await deps.findEventSession(input.eventSessionId);
	if (!eventSession) {
		return {
			kind: 'event_not_found'
		};
	}
	if (eventSession.state !== input.fromState) {
		return {
			kind: 'invalid_state',
			currentState: eventSession.state
		};
	}
	if (!isTransitionAllowed(input.fromState, input.toState)) {
		return {
			kind: 'invalid_state',
			currentState: eventSession.state
		};
	}

	const now = deps.now();
	const updated = await deps.updateState({
		eventSessionId: input.eventSessionId,
		fromState: input.fromState,
		toState: input.toState,
		data:
			input.toState === EventSessionState.ACTIVE
				? {
						startedAt: now
					}
				: input.toState === EventSessionState.ENDED_PENDING_REVIEW
					? {
							endedAt: now
						}
					: undefined
	});
	if (!updated) {
		return {
			kind: 'state_conflict'
		};
	}

	if (input.toState === EventSessionState.ACTIVE && deps.startTracking) {
		await deps.startTracking({
			eventSessionId: input.eventSessionId,
			startedAtMs: now.getTime()
		});
	}
	if (input.toState === EventSessionState.ENDED_PENDING_REVIEW && deps.stopTracking) {
		await deps.stopTracking({
			eventSessionId: input.eventSessionId
		});
	}

	const refreshed = await deps.reloadEventSession(input.eventSessionId);
	if (!refreshed) {
		return {
			kind: 'event_missing_after_transition'
		};
	}

	if (input.toState === EventSessionState.ENDED_PENDING_REVIEW && deps.renameParentVoiceChannel) {
		const parentVoiceChannelId = refreshed.channels.find((channel) => channel.kind === EventSessionChannelKind.PARENT_VC)?.channelId;
		if (parentVoiceChannelId) {
			await deps.renameParentVoiceChannel({
				channelId: parentVoiceChannelId,
				name: 'Post Event Hangout',
				reason: `Event ended by ${input.actorTag ?? input.actor.discordTag ?? input.actor.discordUserId}`
			});
		}
	}

	await deps.syncLifecyclePresentation({
		eventSession: refreshed,
		actorDiscordUserId: input.actor.discordUserId
	});

	if (input.toState === EventSessionState.ACTIVE) {
		return {
			kind: 'activated',
			eventSession: refreshed
		};
	}
	if (input.toState === EventSessionState.CANCELLED) {
		return {
			kind: 'cancelled',
			eventSession: refreshed
		};
	}

	const reviewResult = deps.initializeReview
		? await deps.initializeReview({
				eventSessionId: refreshed.id
			})
		: {
				initialized: true
			};

	return {
		kind: 'ended',
		eventSession: refreshed,
		reviewInitializationFailed: !reviewResult.initialized
	};
}
