import { EventSessionChannelKind, EventSessionState } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import { hasStaffOrCenturionEquivalentCapability } from '../_shared/actor';

export type EventPingSession = {
	id: number;
	name: string;
	state: EventSessionState;
	threadId: string;
	eventPingSentAt: Date | null;
	channels: Array<{
		kind: EventSessionChannelKind;
		channelId: string;
	}>;
};

export type EventPingResultKind =
	| 'forbidden'
	| 'event_not_found'
	| 'concurrency_conflict'
	| 'coordination_unavailable'
	| 'invalid_state'
	| 'already_sent'
	| 'missing_parent_vc'
	| 'announcement_failed'
	| 'receipt_failed'
	| 'sent';

export type EventPingResult = {
	kind: EventPingResultKind;
	currentState?: EventSessionState;
	secondaryFailures: Array<'disable_summary_sync' | 'restore_summary_sync' | 'audit' | 'lock_release'>;
};

type AcquireEventPingLockResult = { kind: 'acquired'; token: string } | { kind: 'busy' } | { kind: 'unavailable' };

export type EventPingServiceDeps = {
	findEventSession: (eventSessionId: number) => Promise<EventPingSession | null>;
	acquireEventSessionOperation: (eventSessionId: number) => Promise<AcquireEventPingLockResult>;
	releaseEventSessionOperation: (eventSessionId: number, token: string) => Promise<boolean>;
	syncSummary: (eventSession: EventPingSession, eventPingInProgress: boolean) => Promise<{ failedCount: number }>;
	sendAnnouncement: (params: { eventSession: EventPingSession; parentVoiceChannelId: string }) => Promise<boolean>;
	markEventPingSent: (params: { eventSessionId: number; sentAt: Date }) => Promise<boolean>;
	postAudit: (params: {
		eventSession: EventPingSession;
		actorDiscordUserId: string;
		outcome: Exclude<EventPingResultKind, 'forbidden' | 'event_not_found'>;
	}) => Promise<boolean>;
	now: () => Date;
};

export async function sendEventPing(deps: EventPingServiceDeps, input: { actor: ActorContext; eventSessionId: number }): Promise<EventPingResult> {
	if (!hasStaffOrCenturionEquivalentCapability(input.actor.capabilities)) {
		return createResult('forbidden');
	}

	const initialSession = await deps.findEventSession(input.eventSessionId);
	if (!initialSession) {
		return createResult('event_not_found');
	}

	const lock = await deps.acquireEventSessionOperation(input.eventSessionId);
	if (lock.kind === 'busy' || lock.kind === 'unavailable') {
		const result = createResult(lock.kind === 'busy' ? 'concurrency_conflict' : 'coordination_unavailable');
		await appendAuditResult(deps, initialSession, input.actor.discordUserId, result);
		return result;
	}

	const result = createResult('coordination_unavailable');
	try {
		const eventSession = await deps.findEventSession(input.eventSessionId);
		if (!eventSession) {
			result.kind = 'event_not_found';
			return result;
		}

		if (eventSession.state !== EventSessionState.ACTIVE) {
			result.kind = 'invalid_state';
			result.currentState = eventSession.state;
			await appendAuditResult(deps, eventSession, input.actor.discordUserId, result);
			return result;
		}

		if (eventSession.eventPingSentAt) {
			result.kind = 'already_sent';
			await appendAuditResult(deps, eventSession, input.actor.discordUserId, result);
			return result;
		}

		const parentVoiceChannelId = eventSession.channels.find((channel) => channel.kind === EventSessionChannelKind.PARENT_VC)?.channelId;
		if (!parentVoiceChannelId) {
			result.kind = 'missing_parent_vc';
			await appendAuditResult(deps, eventSession, input.actor.discordUserId, result);
			return result;
		}

		await appendSummarySyncResult(deps, eventSession, true, 'disable_summary_sync', result);

		const announcementSent = await deps
			.sendAnnouncement({
				eventSession,
				parentVoiceChannelId
			})
			.catch(() => false);
		if (!announcementSent) {
			result.kind = 'announcement_failed';
			await appendSummarySyncResult(deps, eventSession, false, 'restore_summary_sync', result);
			await appendAuditResult(deps, eventSession, input.actor.discordUserId, result);
			return result;
		}

		const sentAt = deps.now();
		const receiptPersisted = await deps
			.markEventPingSent({
				eventSessionId: eventSession.id,
				sentAt
			})
			.catch(() => false);
		result.kind = receiptPersisted ? 'sent' : 'receipt_failed';

		const presentationSession: EventPingSession = receiptPersisted
			? {
					...eventSession,
					eventPingSentAt: sentAt
				}
			: eventSession;
		await appendSummarySyncResult(deps, presentationSession, false, 'restore_summary_sync', result);
		await appendAuditResult(deps, presentationSession, input.actor.discordUserId, result);
		return result;
	} finally {
		const released = await deps.releaseEventSessionOperation(input.eventSessionId, lock.token).catch(() => false);
		if (!released) {
			result.secondaryFailures.push('lock_release');
		}
	}
}

function createResult(kind: EventPingResultKind): EventPingResult {
	return {
		kind,
		secondaryFailures: []
	};
}

async function appendSummarySyncResult(
	deps: Pick<EventPingServiceDeps, 'syncSummary'>,
	eventSession: EventPingSession,
	eventPingInProgress: boolean,
	failure: 'disable_summary_sync' | 'restore_summary_sync',
	result: EventPingResult
) {
	const syncResult = await deps.syncSummary(eventSession, eventPingInProgress).catch(() => ({ failedCount: 1 }));
	if (syncResult.failedCount > 0) {
		result.secondaryFailures.push(failure);
	}
}

async function appendAuditResult(
	deps: Pick<EventPingServiceDeps, 'postAudit'>,
	eventSession: EventPingSession,
	actorDiscordUserId: string,
	result: EventPingResult
) {
	if (result.kind === 'forbidden' || result.kind === 'event_not_found') {
		return;
	}

	const posted = await deps
		.postAudit({
			eventSession,
			actorDiscordUserId,
			outcome: result.kind
		})
		.catch(() => false);
	if (!posted) {
		result.secondaryFailures.push('audit');
	}
}
