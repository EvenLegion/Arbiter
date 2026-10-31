import { EventReviewDecisionKind, EventSessionState, MeritTypeCode, type Prisma } from '@prisma/client';

import { ENV_DISCORD } from '../../../../config/env/discord';
import { computeEventDurationSeconds } from '../../../../lib/services/event-lifecycle/initializeEventReviewState';
import { resolveEventAttendancePolicy, resolveDefaultReviewDecision } from '../../../../lib/services/event-review/eventAttendancePolicy';

type FinalizedEventSessionState = Extract<EventSessionState, 'FINALIZED_WITH_MERITS' | 'FINALIZED_NO_MERITS'>;

export type FinalizeEventReviewResult = {
	finalized: boolean;
	toState: FinalizedEventSessionState;
	awardedCount: number;
	awardedUsers: {
		dbUserId: string;
		discordUserId: string;
		awardedMeritAmount: number;
	}[];
};

export function buildUnfinalizedEventReviewResult(toState: FinalizedEventSessionState): FinalizeEventReviewResult {
	return {
		finalized: false,
		toState,
		awardedCount: 0,
		awardedUsers: []
	};
}

export function buildFinalizedWithoutMeritsResult(toState: FinalizedEventSessionState): FinalizeEventReviewResult {
	return {
		finalized: true,
		toState,
		awardedCount: 0,
		awardedUsers: []
	};
}

export async function loadFinalizableEventReviewSession(tx: Prisma.TransactionClient, eventSessionId: number) {
	return tx.event.findUnique({
		where: {
			id: eventSessionId
		},
		select: {
			id: true,
			state: true,
			startedAt: true,
			endedAt: true,
			expectedEventDuration: true,
			hostUserId: true,
			hostUser: {
				select: {
					discordUserId: true
				}
			},
			eventTier: {
				select: {
					meritTypeId: true,
					meritType: {
						select: {
							meritAmount: true
						}
					}
				}
			}
		}
	});
}

export async function loadCenturionHostMeritType(tx: Prisma.TransactionClient) {
	return tx.meritType.findUniqueOrThrow({
		where: {
			code: MeritTypeCode.CENTURION_HOST_MERIT
		},
		select: {
			id: true,
			meritAmount: true
		}
	});
}

export async function finalizeEventReviewState({
	tx,
	eventSessionId,
	toState,
	reviewerDbUserId,
	now
}: {
	tx: Prisma.TransactionClient;
	eventSessionId: number;
	toState: FinalizedEventSessionState;
	reviewerDbUserId: string;
	now: Date;
}) {
	return tx.event.updateMany({
		where: {
			id: eventSessionId,
			state: EventSessionState.ENDED_PENDING_REVIEW
		},
		data: {
			state: toState,
			reviewFinalizedAt: now,
			reviewFinalizedByUserId: reviewerDbUserId
		}
	});
}

export async function findMeritDecisionRows(tx: Prisma.TransactionClient, eventSessionId: number) {
	return tx.eventReviewDecision.findMany({
		where: {
			eventSessionId,
			decision: EventReviewDecisionKind.MERIT
		},
		select: {
			targetUserId: true,
			targetUser: {
				select: {
					discordUserId: true
				}
			}
		},
		distinct: ['targetUserId']
	});
}

export async function findDefaultReviewDecisionRows(
	tx: Prisma.TransactionClient,
	eventSession: NonNullable<Awaited<ReturnType<typeof loadFinalizableEventReviewSession>>>
) {
	const participants = await tx.eventParticipantStat.findMany({
		where: { eventSessionId: eventSession.id, user: { targetEventDecisions: { none: { eventSessionId: eventSession.id } } } },
		select: { userId: true, attendedSeconds: true, user: { select: { discordUserId: true } } }
	});
	const attendancePolicy = resolveEventAttendancePolicy({
		durationSeconds: computeEventDurationSeconds(eventSession),
		expectedEventDuration: eventSession.expectedEventDuration,
		defaultMinAttendancePct: ENV_DISCORD.EVENT_MERIT_DEFAULT_MIN_ATTENDANCE_PCT
	});
	return participants.map((participant) => ({
		targetUserId: participant.userId,
		targetUser: participant.user,
		decision: resolveDefaultReviewDecision({
			attendedSeconds: participant.attendedSeconds,
			durationSeconds: attendancePolicy.durationSeconds,
			defaultMinAttendancePercent: attendancePolicy.defaultMinAttendancePct
		})
	}));
}

export async function createFinalizedEventReviewMerits({
	tx,
	meritDecisionRows,
	reviewerDbUserId,
	eventSessionId,
	attendanceMeritTypeId,
	attendanceMeritAmount,
	hostUserId,
	hostDiscordUserId,
	hostMeritTypeId,
	hostMeritAmount,
	hostEligible
}: {
	tx: Prisma.TransactionClient;
	meritDecisionRows: Awaited<ReturnType<typeof findMeritDecisionRows>>;
	reviewerDbUserId: string;
	eventSessionId: number;
	attendanceMeritTypeId: number;
	attendanceMeritAmount: number;
	hostUserId: string;
	hostDiscordUserId: string;
	hostMeritTypeId: number;
	hostMeritAmount: number;
	hostEligible: boolean;
}) {
	const meritRows = [
		...meritDecisionRows.map((row) => ({
			userId: row.targetUserId,
			awardedByUserId: reviewerDbUserId,
			meritTypeId: attendanceMeritTypeId,
			reason: 'Awarded for attending',
			eventSessionId
		})),
		...(hostEligible
			? [
					{
						userId: hostUserId,
						awardedByUserId: reviewerDbUserId,
						meritTypeId: hostMeritTypeId,
						reason: 'Awarded for hosting',
						eventSessionId
					}
				]
			: [])
	];
	const createManyResult = await tx.merit.createMany({
		data: meritRows,
		skipDuplicates: true
	});
	const awardedUsersByDbUserId = new Map<
		string,
		{
			dbUserId: string;
			discordUserId: string;
			awardedMeritAmount: number;
		}
	>();
	for (const row of meritDecisionRows) {
		awardedUsersByDbUserId.set(row.targetUserId, {
			dbUserId: row.targetUserId,
			discordUserId: row.targetUser.discordUserId,
			awardedMeritAmount: attendanceMeritAmount
		});
	}

	if (hostEligible) {
		const existingHostAward = awardedUsersByDbUserId.get(hostUserId);
		if (existingHostAward) {
			existingHostAward.awardedMeritAmount += hostMeritAmount;
		} else {
			awardedUsersByDbUserId.set(hostUserId, {
				dbUserId: hostUserId,
				discordUserId: hostDiscordUserId,
				awardedMeritAmount: hostMeritAmount
			});
		}
	}

	return {
		createManyResult,
		awardedUsers: [...awardedUsersByDbUserId.values()]
	};
}
