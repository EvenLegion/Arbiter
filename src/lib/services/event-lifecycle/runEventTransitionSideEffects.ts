import { EventSessionChannelKind, EventSessionState } from '@prisma/client';

import { buildEndedParentVoiceChannelRename } from './eventLifecycleChannelPolicy';
import type { EventTransitionSideEffectResult, TransitionEventSessionDeps, TransitionEventSessionWorkflowInput } from './transitionEventSession';
import type { EventLifecycleEventSession } from './eventLifecycleTypes';

export async function runEventTransitionSideEffects(
	deps: Pick<
		TransitionEventSessionDeps,
		'startTracking' | 'stopTracking' | 'renameParentVoiceChannel' | 'syncLifecyclePresentation' | 'initializeReview'
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
