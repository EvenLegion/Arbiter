import { EventSessionState, type EventReviewDecisionKind } from '@prisma/client';
import { prisma } from '../../prisma';
import { upsertManyEventParticipantStats, type UpsertManyEventParticipantStatsParams } from './upsertManyEventParticipantStats';

/** Serialize against finalization; a retry must never modify a finalized event. */
export async function saveEventReviewInitialization({
	eventSessionId,
	participants,
	decisions
}: UpsertManyEventParticipantStatsParams & {
	decisions: Array<{ targetDbUserId: string; decision: EventReviewDecisionKind }>;
}) {
	return prisma.$transaction(async (tx) => {
		const rows = await tx.$queryRaw<Array<{ state: EventSessionState }>>`
   SELECT "state" FROM "Event" WHERE "id" = ${eventSessionId} FOR UPDATE
  `;
		if (rows[0]?.state !== EventSessionState.ENDED_PENDING_REVIEW) return false;
		await upsertManyEventParticipantStats({ eventSessionId, participants }, tx);
		if (decisions.length > 0) {
			await tx.eventReviewDecision.createMany({
				data: decisions.map(({ targetDbUserId, decision }) => ({ eventSessionId, targetUserId: targetDbUserId, decision })),
				skipDuplicates: true
			});
		}
		return true;
	});
}
