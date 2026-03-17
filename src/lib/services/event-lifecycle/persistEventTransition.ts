import { EventSessionState } from '@prisma/client';

import type { PersistTransitionInput, TransitionEventSessionDeps, TransitionEventSessionResult } from './transitionEventSession';
import type { EventLifecycleEventSession } from './eventLifecycleTypes';

export async function persistEventTransition(
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
