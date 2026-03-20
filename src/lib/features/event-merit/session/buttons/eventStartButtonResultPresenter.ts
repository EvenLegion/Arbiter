import { EventSessionState } from '@prisma/client';
import { MessageFlags } from 'discord.js';

import type { TransitionEventSessionResult } from '../../../../services/event-lifecycle';
import { formatEventSessionStateLabel } from '../../presentation/shared/formatEventSessionStateLabel';
import type { ParsedEventStartButton } from './eventStartButtonCustomId';

type EventStartButtonResponse =
	| {
			delivery: 'fail';
			content: string;
	  }
	| {
			delivery: 'success';
			followUp?: {
				content: string;
				flags: MessageFlags.Ephemeral;
			};
	  };

export function presentEventStartButtonResult({
	action,
	result,
	requestId
}: {
	action: ParsedEventStartButton['action'];
	result: TransitionEventSessionResult;
	requestId: string;
}): EventStartButtonResponse {
	if (result.kind === 'forbidden') {
		return {
			delivery: 'fail',
			content: 'Only staff or Centurions can perform this action.'
		};
	}
	if (result.kind === 'event_not_found') {
		return {
			delivery: 'fail',
			content: 'Event session not found.'
		};
	}
	if (result.kind === 'invalid_state') {
		const expectedState = action === 'confirm' || action === 'cancel' ? EventSessionState.DRAFT : EventSessionState.ACTIVE;
		return {
			delivery: 'fail',
			content: `This event is no longer in ${formatEventSessionStateLabel(expectedState)} state (current state: ${formatEventSessionStateLabel(result.currentState)}).`
		};
	}
	if (result.kind === 'state_conflict') {
		return {
			delivery: 'fail',
			content:
				action === 'confirm'
					? 'Unable to start the draft event. It may have already been updated.'
					: action === 'end'
						? 'Unable to end the active event. It may have already been updated.'
						: 'Unable to cancel the draft event. It may have already been updated.'
		};
	}
	if (result.kind === 'event_missing_after_transition') {
		return {
			delivery: 'fail',
			content:
				action === 'confirm'
					? 'Event session not found after activation.'
					: action === 'end'
						? 'Event session not found after ending.'
						: 'Event session not found after cancellation.'
		};
	}

	return {
		delivery: 'success',
		...(result.kind === 'ended' && result.reviewInitializationFailed
			? {
					followUp: {
						content: `Event ended, but review initialization failed. Please contact TECH with requestId=${requestId}.`,
						flags: MessageFlags.Ephemeral
					}
				}
			: {})
	};
}
