import { EventSessionState } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import type { EventLifecycleEventSession } from './eventLifecycleTypes';
import { loadAndValidateEventTransition } from './loadAndValidateEventTransition';
import { persistEventTransition } from './persistEventTransition';
import { runEventTransitionSideEffects } from './runEventTransitionSideEffects';

export type TransitionEventSessionDeps = {
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

export type TransitionEventSessionWorkflowInput = {
	actor: ActorContext;
	eventSessionId: number;
	fromState: EventSessionState;
	toState: Extract<EventSessionState, 'ACTIVE' | 'CANCELLED' | 'ENDED_PENDING_REVIEW'>;
	actorTag?: string;
};

export type PersistTransitionInput = Pick<TransitionEventSessionWorkflowInput, 'eventSessionId' | 'fromState' | 'toState'>;

export type LoadedEventTransition = {
	eventSession: EventLifecycleEventSession;
};

export type EventTransitionSideEffectResult = {
	reviewInitializationFailed: boolean;
};

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
	input: TransitionEventSessionWorkflowInput
): Promise<TransitionEventSessionResult> {
	const validation = await loadAndValidateEventTransition(deps, input);
	if ('result' in validation) {
		return validation.result;
	}

	const now = deps.now();
	const persisted = await persistEventTransition(
		deps,
		{
			eventSessionId: input.eventSessionId,
			fromState: input.fromState,
			toState: input.toState
		},
		now
	);
	if ('result' in persisted) {
		return persisted.result;
	}

	const sideEffects = await runEventTransitionSideEffects(
		deps,
		{
			actor: input.actor,
			eventSessionId: input.eventSessionId,
			fromState: input.fromState,
			toState: input.toState,
			actorTag: input.actorTag
		},
		persisted.eventSession,
		now
	);

	if (input.toState === EventSessionState.ACTIVE) {
		return {
			kind: 'activated',
			eventSession: persisted.eventSession
		};
	}
	if (input.toState === EventSessionState.CANCELLED) {
		return {
			kind: 'cancelled',
			eventSession: persisted.eventSession
		};
	}

	return {
		kind: 'ended',
		eventSession: persisted.eventSession,
		reviewInitializationFailed: sideEffects.reviewInitializationFailed
	};
}
