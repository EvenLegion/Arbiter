import { EventReviewDecisionKind, type EventReviewDecisionKind as EventReviewDecisionKindType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';

type UpsertEventReviewDecisionParams = {
	eventSessionId: number;
	targetDbUserId: string;
	decision: EventReviewDecisionKindType;
};

const EVENT_REVIEW_DECISION_KIND_SCHEMA = z.enum(EventReviewDecisionKind);
const UPSERT_EVENT_REVIEW_DECISION_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	targetDbUserId: z.string().min(1),
	decision: EVENT_REVIEW_DECISION_KIND_SCHEMA
});

export async function upsertEventReviewDecision({ eventSessionId, targetDbUserId, decision }: UpsertEventReviewDecisionParams) {
	const parsed = UPSERT_EVENT_REVIEW_DECISION_SCHEMA.parse({
		eventSessionId,
		targetDbUserId,
		decision
	});

	return prisma.eventReviewDecision.upsert({
		where: {
			eventSessionId_targetUserId: {
				eventSessionId: parsed.eventSessionId,
				targetUserId: parsed.targetDbUserId
			}
		},
		update: {
			decision: parsed.decision
		},
		create: {
			eventSessionId: parsed.eventSessionId,
			targetUserId: parsed.targetDbUserId,
			decision: parsed.decision
		}
	});
}
