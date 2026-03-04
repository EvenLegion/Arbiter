import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { prisma, findUniqueEventSession, upsertManyEventParticipantStats, upsertManyEventReviewDecisions } from '../../../../integrations/prisma';
import { clearTrackingSession, getTrackingParticipantsSnapshot } from '../../../../integrations/redis/eventTracking';
import type { ExecutionContext } from '../../../logging/executionContext';
import { EVENT_REVIEW_MERIT_THRESHOLD } from './constants';
import { syncEventReviewMessage } from './syncEventReviewMessage';

type InitializeEventReviewParams = {
	guild: import('discord.js').Guild;
	eventSessionId: number;
	context: ExecutionContext;
};

export async function initializeEventReview({ guild, eventSessionId, context }: InitializeEventReviewParams) {
	const caller = 'initializeEventReview';
	const logger = context.logger.child({
		caller,
		eventSessionId
	});

	const eventSession = await findUniqueEventSession({
		eventSessionId
	});
	if (!eventSession) {
		throw new Error(`Event session not found while initializing review: eventSessionId=${eventSessionId}`);
	}

	if (eventSession.state !== EventSessionState.ENDED_PENDING_REVIEW) {
		logger.warn(
			{
				state: eventSession.state
			},
			'Skipping event review initialization because event is not ENDED_PENDING_REVIEW'
		);
		return;
	}

	const durationSeconds = computeDurationSeconds(eventSession.startedAt, eventSession.endedAt);
	const participantSnapshots = await getTrackingParticipantsSnapshot({
		eventSessionId
	});
	const discordUserIds = [...new Set(participantSnapshots.map((snapshot) => snapshot.discordUserId))];

	const users =
		discordUserIds.length > 0
			? await prisma.user.findMany({
					where: {
						discordUserId: {
							in: discordUserIds
						}
					},
					select: {
						id: true,
						discordUserId: true
					}
				})
			: [];
	const dbUserIdByDiscordUserId = new Map(users.map((user) => [user.discordUserId, user.id]));

	const participantsForUpsert: Array<{
		dbUserId: string;
		attendedSeconds: number;
	}> = [];

	for (const participant of participantSnapshots) {
		const dbUserId = dbUserIdByDiscordUserId.get(participant.discordUserId);
		if (!dbUserId) {
			logger.warn(
				{
					discordUserId: participant.discordUserId
				},
				'Skipping event participant because Discord user does not exist in database'
			);
			continue;
		}

		participantsForUpsert.push({
			dbUserId,
			attendedSeconds: clampAttendedSeconds(participant.attendedSeconds, durationSeconds)
		});
	}

	await upsertManyEventParticipantStats({
		eventSessionId,
		participants: participantsForUpsert
	});

	await upsertManyEventReviewDecisions({
		eventSessionId,
		decisions: participantsForUpsert.map((participant) => ({
			targetDbUserId: participant.dbUserId,
			decision: resolveDefaultDecision({
				attendedSeconds: participant.attendedSeconds,
				durationSeconds
			})
		})),
		overwriteExisting: false
	});

	await clearTrackingSession({
		eventSessionId
	});

	const synced = await syncEventReviewMessage({
		guild,
		eventSessionId,
		page: 1,
		logger
	});
	if (!synced) {
		throw new Error(`Failed to create or update review message for eventSessionId=${eventSessionId}`);
	}

	logger.info(
		{
			durationSeconds,
			snapshotParticipantCount: participantSnapshots.length,
			persistedParticipantCount: participantsForUpsert.length
		},
		'Initialized post-event merit review'
	);
}

function computeDurationSeconds(startedAt: Date | null, endedAt: Date | null) {
	if (!startedAt || !endedAt) {
		return 0;
	}

	return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
}

function clampAttendedSeconds(attendedSeconds: number, durationSeconds: number) {
	const safeAttendedSeconds = Math.max(0, attendedSeconds);
	if (durationSeconds <= 0) {
		return safeAttendedSeconds;
	}

	return Math.min(durationSeconds, safeAttendedSeconds);
}

function resolveDefaultDecision({ attendedSeconds, durationSeconds }: { attendedSeconds: number; durationSeconds: number }) {
	if (durationSeconds <= 0) {
		return EventReviewDecisionKind.NO_MERIT;
	}

	return attendedSeconds / durationSeconds >= EVENT_REVIEW_MERIT_THRESHOLD ? EventReviewDecisionKind.MERIT : EventReviewDecisionKind.NO_MERIT;
}
