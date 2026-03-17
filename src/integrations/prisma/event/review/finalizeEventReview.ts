import { z } from 'zod';
import { finalizeEventReviewTransaction, type FinalizeEventReviewResult } from './finalizeEventReviewTransaction';

type FinalizeEventReviewParams = {
	eventSessionId: number;
	reviewerDbUserId: string;
	mode: 'with' | 'without';
};

const FINALIZE_EVENT_REVIEW_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	reviewerDbUserId: z.string().min(1),
	mode: z.enum(['with', 'without'])
});

export async function finalizeEventReview(params: FinalizeEventReviewParams): Promise<FinalizeEventReviewResult> {
	const parsed = FINALIZE_EVENT_REVIEW_SCHEMA.parse(params);
	return finalizeEventReviewTransaction(parsed);
}
