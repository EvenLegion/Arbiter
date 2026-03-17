import { EventReviewDecisionKind, EventSessionState, type Prisma } from '@prisma/client';

type FinalizedEventSessionState = Extract<EventSessionState, 'FINALIZED_WITH_MERITS' | 'FINALIZED_NO_MERITS'>;

export type FinalizeEventReviewResult = {
	finalized: boolean;
	toState: FinalizedEventSessionState;
	awardedCount: number;
	awardedMeritAmount: number;
	awardedUsers: {
		dbUserId: string;
		discordUserId: string;
	}[];
};

export function buildUnfinalizedEventReviewResult(toState: FinalizedEventSessionState): FinalizeEventReviewResult {
	return {
		finalized: false,
		toState,
		awardedCount: 0,
		awardedMeritAmount: 0,
		awardedUsers: []
	};
}

export function buildFinalizedWithoutMeritsResult(toState: FinalizedEventSessionState): FinalizeEventReviewResult {
	return {
		finalized: true,
		toState,
		awardedCount: 0,
		awardedMeritAmount: 0,
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
	meritTypeId
}: {
	tx: Prisma.TransactionClient;
	meritDecisionRows: Awaited<ReturnType<typeof findMeritDecisionRows>>;
	reviewerDbUserId: string;
	eventSessionId: number;
	meritTypeId: number;
}) {
	return tx.merit.createMany({
		data: meritDecisionRows.map((row) => ({
			userId: row.targetUserId,
			awardedByUserId: reviewerDbUserId,
			meritTypeId,
			reason: 'Awarded for attending',
			eventSessionId
		})),
		skipDuplicates: true
	});
}
