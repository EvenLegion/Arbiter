import { z } from 'zod';
import { prisma } from './prisma';

type SaveNameChangeRequestReviewMessageParams = {
	requestId: number;
	reviewThreadId: string;
	reviewMessageId: string;
};

const SAVE_NAME_CHANGE_REQUEST_REVIEW_MESSAGE_SCHEMA = z.object({
	requestId: z.number().int().positive(),
	reviewThreadId: z.string().trim().min(1),
	reviewMessageId: z.string().trim().min(1)
});

export async function saveNameChangeRequestReviewMessage(params: SaveNameChangeRequestReviewMessageParams) {
	const parsed = SAVE_NAME_CHANGE_REQUEST_REVIEW_MESSAGE_SCHEMA.parse(params);

	return prisma.nameChangeRequest.update({
		where: {
			id: parsed.requestId
		},
		data: {
			reviewThreadId: parsed.reviewThreadId,
			reviewMessageId: parsed.reviewMessageId
		}
	});
}
