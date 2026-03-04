import { EventReviewDecisionKind, type EventReviewDecisionKind as EventReviewDecisionKindType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';

type UpsertManyEventReviewDecisionsParams = {
	eventSessionId: number;
	decisions: Array<{
		targetDbUserId: string;
		decision: EventReviewDecisionKindType;
	}>;
	overwriteExisting?: boolean;
};

const EVENT_REVIEW_DECISION_KIND_SCHEMA = z.enum(EventReviewDecisionKind);
const UPSERT_MANY_EVENT_REVIEW_DECISIONS_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	decisions: z.array(
		z.object({
			targetDbUserId: z.string().min(1),
			decision: EVENT_REVIEW_DECISION_KIND_SCHEMA
		})
	),
	overwriteExisting: z.boolean().default(false)
});

export async function upsertManyEventReviewDecisions({ eventSessionId, decisions, overwriteExisting = false }: UpsertManyEventReviewDecisionsParams) {
	const parsed = UPSERT_MANY_EVENT_REVIEW_DECISIONS_SCHEMA.parse({
		eventSessionId,
		decisions,
		overwriteExisting
	});

	if (parsed.decisions.length === 0) {
		return;
	}

	const uniqueByTargetUser = new Map<string, EventReviewDecisionKindType>();
	for (const decision of parsed.decisions) {
		uniqueByTargetUser.set(decision.targetDbUserId, decision.decision);
	}
	const uniqueDecisions = [...uniqueByTargetUser.entries()].map(([targetDbUserId, decision]) => ({
		targetDbUserId,
		decision
	}));

	if (parsed.overwriteExisting) {
		await prisma.$transaction(
			uniqueDecisions.map((item) =>
				prisma.eventReviewDecision.upsert({
					where: {
						eventSessionId_targetUserId: {
							eventSessionId: parsed.eventSessionId,
							targetUserId: item.targetDbUserId
						}
					},
					update: {
						decision: item.decision
					},
					create: {
						eventSessionId: parsed.eventSessionId,
						targetUserId: item.targetDbUserId,
						decision: item.decision
					}
				})
			)
		);
		return;
	}

	await prisma.eventReviewDecision.createMany({
		data: uniqueDecisions.map((item) => ({
			eventSessionId: parsed.eventSessionId,
			targetUserId: item.targetDbUserId,
			decision: item.decision
		})),
		skipDuplicates: true
	});
}
