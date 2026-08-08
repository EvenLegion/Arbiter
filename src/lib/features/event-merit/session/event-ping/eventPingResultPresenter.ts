import { EventSessionState } from '@prisma/client';

import type { EventPingResult } from '../../../../services/event-ping';
import { formatEventSessionStateLabel } from '../../presentation/shared/formatEventSessionStateLabel';

export function presentEventPingResult(result: EventPingResult, requestId: string) {
	let content: string;
	if (result.kind === 'sent') {
		content = 'Event Ping sent successfully.';
	} else if (result.kind === 'announcement_failed') {
		content = 'Event Ping failed before Discord accepted it. Please try again.';
	} else if (result.kind === 'receipt_failed') {
		content = `Discord accepted the Event Ping, but Arbiter could not save its receipt. Do not retry; contact TECH with requestId=${requestId}.`;
	} else if (result.kind === 'concurrency_conflict') {
		content = 'Another Event Ping or End Event action is already in progress. Please try again shortly.';
	} else if (result.kind === 'coordination_unavailable') {
		content = `Event Ping coordination is temporarily unavailable. Please try again. requestId=${requestId}`;
	} else if (result.kind === 'already_sent') {
		content = 'This event has already sent its Event Ping.';
	} else if (result.kind === 'missing_parent_vc') {
		content = `This event no longer has a tracked parent voice channel. Contact TECH with requestId=${requestId}.`;
	} else if (result.kind === 'invalid_state') {
		content = `This event is no longer active (current state: ${formatEventSessionStateLabel(result.currentState ?? EventSessionState.ACTIVE)}).`;
	} else if (result.kind === 'event_not_found') {
		content = 'Event session not found.';
	} else {
		content = 'Only staff or Centurions can send an Event Ping.';
	}

	if (result.secondaryFailures.length > 0 && (result.kind === 'sent' || result.kind === 'receipt_failed')) {
		content += ` Some tracking or summary updates did not complete; contact TECH with requestId=${requestId}.`;
	} else if (result.secondaryFailures.includes('restore_summary_sync')) {
		content += ` The summary controls did not fully synchronize; use any re-enabled copy or contact TECH with requestId=${requestId}.`;
	}

	return {
		content
	};
}
