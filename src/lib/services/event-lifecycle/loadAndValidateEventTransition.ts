import type { TransitionEventSessionDeps, TransitionEventSessionResult } from './transitionEventSession';
import { isTransitionAllowed } from './eventLifecycleStateMachine';
import type { LoadedEventTransition, TransitionEventSessionWorkflowInput } from './transitionEventSession';

export async function loadAndValidateEventTransition(
	deps: Pick<TransitionEventSessionDeps, 'findEventSession'>,
	input: TransitionEventSessionWorkflowInput
): Promise<LoadedEventTransition | { result: TransitionEventSessionResult }> {
	if (!input.actor.capabilities.isStaff && !input.actor.capabilities.isCenturion) {
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
