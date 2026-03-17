import { z } from 'zod';

import { prisma } from '../prisma';

const SAVE_NAME_CHANGE_REQUEST_REVIEW_THREAD_SCHEMA = z.object({
	requestId: z.number().int().positive(),
	reviewThreadId: z.string().trim().min(1)
});

export async function saveNameChangeRequestReviewThread(params: { requestId: number; reviewThreadId: string }) {
	const parsed = SAVE_NAME_CHANGE_REQUEST_REVIEW_THREAD_SCHEMA.parse(params);

	return prisma.nameChangeRequest.update({
		where: {
			id: parsed.requestId
		},
		data: {
			reviewThreadId: parsed.reviewThreadId
		}
	});
}
