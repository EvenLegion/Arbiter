import { EventReviewDecisionKind, EventSessionState, MeritTypeCode, type Prisma } from '@prisma/client';

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
	hostMeritAmount
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
}) {
	const meritRows = [
		...meritDecisionRows.map((row) => ({
			userId: row.targetUserId,
			awardedByUserId: reviewerDbUserId,
			meritTypeId: attendanceMeritTypeId,
			reason: 'Awarded for attending',
			eventSessionId
		})),
		{
			userId: hostUserId,
			awardedByUserId: reviewerDbUserId,
			meritTypeId: hostMeritTypeId,
			reason: 'Awarded for hosting',
			eventSessionId
		}
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

	return {
		createManyResult,
		awardedUsers: [...awardedUsersByDbUserId.values()]
	};
}
