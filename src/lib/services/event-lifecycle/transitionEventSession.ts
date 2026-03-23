import { EventSessionChannelKind, EventSessionState } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import { hasStaffOrCenturionEquivalentCapability } from '../_shared/actor';
import type { EventLifecycleEventSession } from './eventLifecycleTypes';

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
	postEndedEventFeedbackLinks?: (params: { eventSession: EventLifecycleEventSession }) => Promise<void>;
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

const ALLOWED_EVENT_TRANSITIONS: Record<EventSessionState, readonly EventSessionState[]> = {
	[EventSessionState.DRAFT]: [EventSessionState.ACTIVE, EventSessionState.CANCELLED],
	[EventSessionState.CANCELLED]: [],
	[EventSessionState.ACTIVE]: [EventSessionState.ENDED_PENDING_REVIEW],
	[EventSessionState.ENDED_PENDING_REVIEW]: [EventSessionState.FINALIZED_WITH_MERITS, EventSessionState.FINALIZED_NO_MERITS],
	[EventSessionState.FINALIZED_WITH_MERITS]: [],
	[EventSessionState.FINALIZED_NO_MERITS]: []
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

async function loadAndValidateEventTransition(
	deps: Pick<TransitionEventSessionDeps, 'findEventSession'>,
	input: TransitionEventSessionWorkflowInput
): Promise<LoadedEventTransition | { result: TransitionEventSessionResult }> {
	if (!hasStaffOrCenturionEquivalentCapability(input.actor.capabilities)) {
		return {
			result: {
				kind: 'forbidden'
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
	if (eventSession.state !== input.fromState || !isTransitionAllowed(input.fromState, input.toState)) {
		return {
			result: {
				kind: 'invalid_state',
				currentState: eventSession.state
			}
		};
	}

	return {
		eventSession
	};
}

async function persistEventTransition(
	deps: Pick<TransitionEventSessionDeps, 'updateState' | 'reloadEventSession'>,
	input: PersistTransitionInput,
	now: Date
): Promise<{ eventSession: EventLifecycleEventSession } | { result: TransitionEventSessionResult }> {
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
			result: {
				kind: 'state_conflict'
			}
		};
	}

	const refreshed = await deps.reloadEventSession(input.eventSessionId);
	if (!refreshed) {
		return {
			result: {
				kind: 'event_missing_after_transition'
			}
		};
	}

	return {
		eventSession: refreshed
	};
}

async function runEventTransitionSideEffects(
	deps: Pick<
		TransitionEventSessionDeps,
		| 'startTracking'
		| 'stopTracking'
		| 'renameParentVoiceChannel'
		| 'syncLifecyclePresentation'
		| 'postEndedEventFeedbackLinks'
		| 'initializeReview'
	>,
	input: TransitionEventSessionWorkflowInput,
	eventSession: EventLifecycleEventSession,
	now: Date
): Promise<EventTransitionSideEffectResult> {
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

	if (input.toState === EventSessionState.ENDED_PENDING_REVIEW && deps.renameParentVoiceChannel) {
		const parentVoiceChannelId = eventSession.channels.find((channel) => channel.kind === EventSessionChannelKind.PARENT_VC)?.channelId;
		if (parentVoiceChannelId) {
			const rename = buildEndedParentVoiceChannelRename({
				actor: input.actor,
				actorTag: input.actorTag
			});
			await deps.renameParentVoiceChannel({
				channelId: parentVoiceChannelId,
				name: rename.name,
				reason: rename.reason
			});
		}
	}

	await deps.syncLifecyclePresentation({
		eventSession,
		actorDiscordUserId: input.actor.discordUserId
	});

	if (input.toState === EventSessionState.ENDED_PENDING_REVIEW && deps.postEndedEventFeedbackLinks) {
		await deps.postEndedEventFeedbackLinks({
			eventSession
		});
	}

	const reviewResult = deps.initializeReview
		? await deps.initializeReview({
				eventSessionId: eventSession.id
			})
		: {
				initialized: true
			};

	return {
		reviewInitializationFailed: input.toState === EventSessionState.ENDED_PENDING_REVIEW ? !reviewResult.initialized : false
	};
}

function isTransitionAllowed(fromState: EventSessionState, toState: EventSessionState) {
	return ALLOWED_EVENT_TRANSITIONS[fromState].includes(toState);
}

function buildEndedParentVoiceChannelRename({ actor, actorTag }: { actor: ActorContext; actorTag?: string }) {
	return {
		name: 'Post Event Hangout',
		reason: `Event ended by ${actorTag ?? actor.discordTag ?? actor.discordUserId}`
	};
}
