import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';

type FinalizeEventReviewParams = {
	eventSessionId: number;
	reviewerDbUserId: string;
	mode: 'with' | 'without';
};

type FinalizedEventSessionState = Extract<EventSessionState, 'FINALIZED_WITH_MERITS' | 'FINALIZED_NO_MERITS'>;

type FinalizeEventReviewResult = {
	finalized: boolean;
	toState: FinalizedEventSessionState;
	awardedCount: number;
	awardedMeritAmount: number;
	awardedUsers: {
		dbUserId: string;
		discordUserId: string;
	}[];
};

const FINALIZE_EVENT_REVIEW_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	reviewerDbUserId: z.string().min(1),
	mode: z.enum(['with', 'without'])
});

export async function finalizeEventReview(params: FinalizeEventReviewParams): Promise<FinalizeEventReviewResult> {
	const parsed = FINALIZE_EVENT_REVIEW_SCHEMA.parse(params);
	const toState: FinalizeEventReviewResult['toState'] =
		parsed.mode === 'with' ? EventSessionState.FINALIZED_WITH_MERITS : EventSessionState.FINALIZED_NO_MERITS;

	const now = new Date();

	return prisma.$transaction(async (tx) => {
		const eventSession = await tx.eventSession.findUnique({
			where: {
				id: parsed.eventSessionId
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

		if (!eventSession || eventSession.state !== EventSessionState.ENDED_PENDING_REVIEW) {
			return {
				finalized: false,
				toState,
				awardedCount: 0,
				awardedMeritAmount: 0,
				awardedUsers: []
			};
		}

		const updated = await tx.eventSession.updateMany({
			where: {
				id: parsed.eventSessionId,
				state: EventSessionState.ENDED_PENDING_REVIEW
			},
			data: {
				state: toState,
				reviewFinalizedAt: now,
				reviewFinalizedByUserId: parsed.reviewerDbUserId
			}
		});
		if (updated.count !== 1) {
			return {
				finalized: false,
				toState,
				awardedCount: 0,
				awardedMeritAmount: 0,
				awardedUsers: []
			};
		}

		if (parsed.mode !== 'with') {
			return {
				finalized: true,
				toState,
				awardedCount: 0,
				awardedMeritAmount: 0,
				awardedUsers: []
			};
		}

		const meritDecisionRows = await tx.eventReviewDecision.findMany({
			where: {
				eventSessionId: parsed.eventSessionId,
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

		if (meritDecisionRows.length === 0) {
			return {
				finalized: true,
				toState,
				awardedCount: 0,
				awardedMeritAmount: 0,
				awardedUsers: []
			};
		}

		const createManyResult = await tx.merit.createMany({
			data: meritDecisionRows.map((row) => ({
				userId: row.targetUserId,
				awardedByUserId: parsed.reviewerDbUserId,
				meritTypeId: eventSession.eventTier.meritTypeId,
				reason: `Awarded for attending`,
				eventSessionId: parsed.eventSessionId
			})),
			skipDuplicates: true
		});

		return {
			finalized: true,
			toState,
			awardedCount: createManyResult.count,
			awardedMeritAmount: eventSession.eventTier.meritType.meritAmount,
			awardedUsers: meritDecisionRows.map((row) => ({
				dbUserId: row.targetUserId,
				discordUserId: row.targetUser.discordUserId
			}))
		};
	});
}
