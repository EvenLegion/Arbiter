import { EventSessionChannelKind, EventSessionState } from '@prisma/client';

import { isTransitionAllowed } from './eventLifecycleStateMachine';
import type {
	AddTrackedChannelDeps,
	AddTrackedChannelResult,
	AddTrackedChannelWorkflowInput,
	ValidatedTrackedChannelAddition
} from './addTrackedChannel';

export async function loadAndValidateTrackedChannelAddition(
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
	if (!isTransitionAllowed(eventSession.state, EventSessionState.ACTIVE) && eventSession.state !== EventSessionState.DRAFT) {
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
