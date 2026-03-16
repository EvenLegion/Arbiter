import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';

import { computeEventDurationSeconds } from '../../features/event-merit/review/computeEventDurationSeconds';
import type { EventReviewParticipantSnapshot, EventReviewUserLookup } from './eventLifecycleTypes';

type InitializeEventReviewDeps = {
	findEventSession: (eventSessionId: number) => Promise<{
		id: number;
		state: EventSessionState;
		startedAt: Date | null;
		endedAt: Date | null;
	} | null>;
	getTrackingParticipantsSnapshot: (eventSessionId: number) => Promise<EventReviewParticipantSnapshot[]>;
	findUsersByDiscordUserIds: (discordUserIds: string[]) => Promise<EventReviewUserLookup[]>;
	upsertParticipantStats: (params: {
		eventSessionId: number;
		participants: Array<{
			dbUserId: string;
			attendedSeconds: number;
		}>;
	}) => Promise<void>;
	upsertReviewDecisions: (params: {
		eventSessionId: number;
		decisions: Array<{
			targetDbUserId: string;
			decision: EventReviewDecisionKind;
		}>;
		overwriteExisting: boolean;
	}) => Promise<void>;
	clearTrackingSession: (eventSessionId: number) => Promise<void>;
	syncReviewMessage: (params: { eventSessionId: number; page: number }) => Promise<boolean>;
	defaultMinAttendancePercent: number;
};

export type InitializeEventReviewResult =
	| { kind: 'event_not_found' }
	| { kind: 'invalid_state'; currentState: EventSessionState }
	| {
			kind: 'review_initialized';
			durationSeconds: number;
			snapshotParticipantCount: number;
			persistedParticipantCount: number;
	  }
	| {
			kind: 'review_initialized_sync_failed';
			durationSeconds: number;
			snapshotParticipantCount: number;
			persistedParticipantCount: number;
	  };

export async function initializeEventReviewState(
	deps: InitializeEventReviewDeps,
	input: {
		eventSessionId: number;
	}
): Promise<InitializeEventReviewResult> {
	const eventSession = await deps.findEventSession(input.eventSessionId);
	if (!eventSession) {
		return {
			kind: 'event_not_found'
		};
	}
	if (eventSession.state !== EventSessionState.ENDED_PENDING_REVIEW) {
		return {
			kind: 'invalid_state',
			currentState: eventSession.state
		};
	}

	const durationSeconds = computeEventDurationSeconds({
		startedAt: eventSession.startedAt,
		endedAt: eventSession.endedAt
	});
	const participantSnapshots = await deps.getTrackingParticipantsSnapshot(input.eventSessionId);
	const discordUserIds = [...new Set(participantSnapshots.map((snapshot) => snapshot.discordUserId))];
	const users = discordUserIds.length > 0 ? await deps.findUsersByDiscordUserIds(discordUserIds) : [];
	const dbUserIdByDiscordUserId = new Map(users.map((user) => [user.discordUserId, user.id]));

	const participants = participantSnapshots.flatMap((participant) => {
		const dbUserId = dbUserIdByDiscordUserId.get(participant.discordUserId);
		if (!dbUserId) {
			return [];
		}

		return [
			{
				dbUserId,
				attendedSeconds: clampAttendedSeconds(participant.attendedSeconds, durationSeconds)
			}
		];
	});

	await deps.upsertParticipantStats({
		eventSessionId: input.eventSessionId,
		participants
	});

	await deps.upsertReviewDecisions({
		eventSessionId: input.eventSessionId,
		decisions: participants.map((participant) => ({
			targetDbUserId: participant.dbUserId,
			decision: resolveDefaultDecision({
				attendedSeconds: participant.attendedSeconds,
				durationSeconds,
				defaultMinAttendancePercent: deps.defaultMinAttendancePercent
			})
		})),
		overwriteExisting: false
	});

	await deps.clearTrackingSession(input.eventSessionId);

	const synced = await deps.syncReviewMessage({
		eventSessionId: input.eventSessionId,
		page: 1
	});

	return {
		kind: synced ? 'review_initialized' : 'review_initialized_sync_failed',
		durationSeconds,
		snapshotParticipantCount: participantSnapshots.length,
		persistedParticipantCount: participants.length
	};
}

function clampAttendedSeconds(attendedSeconds: number, durationSeconds: number) {
	const safeAttendedSeconds = Math.max(0, attendedSeconds);
	if (durationSeconds <= 0) {
		return safeAttendedSeconds;
	}

	return Math.min(durationSeconds, safeAttendedSeconds);
}

function resolveDefaultDecision({
	attendedSeconds,
	durationSeconds,
	defaultMinAttendancePercent
}: {
	attendedSeconds: number;
	durationSeconds: number;
	defaultMinAttendancePercent: number;
}) {
	if (durationSeconds <= 0) {
		return EventReviewDecisionKind.NO_MERIT;
	}

	return attendedSeconds / durationSeconds >= defaultMinAttendancePercent / 100 ? EventReviewDecisionKind.MERIT : EventReviewDecisionKind.NO_MERIT;
}
