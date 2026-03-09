import { NameChangeRequestStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';

type ReviewNameChangeRequestParams = {
	requestId: number;
	reviewerDbUserId: string;
	decision: 'approve' | 'deny';
};

const REVIEW_NAME_CHANGE_REQUEST_SCHEMA = z.object({
	requestId: z.number().int().positive(),
	reviewerDbUserId: z.string().min(1),
	decision: z.enum(['approve', 'deny'])
});

export async function reviewNameChangeRequest(params: ReviewNameChangeRequestParams) {
	const parsed = REVIEW_NAME_CHANGE_REQUEST_SCHEMA.parse(params);
	const nextStatus = parsed.decision === 'approve' ? NameChangeRequestStatus.APPROVED : NameChangeRequestStatus.DENIED;

	return prisma.$transaction(async (tx) => {
		const updated = await tx.nameChangeRequest.updateMany({
			where: {
				id: parsed.requestId,
				status: NameChangeRequestStatus.PENDING
			},
			data: {
				status: nextStatus,
				reviewerUserId: parsed.reviewerDbUserId,
				reviewedAt: new Date()
			}
		});
		if (updated.count !== 1) {
			return null;
		}

		return tx.nameChangeRequest.findUnique({
			where: {
				id: parsed.requestId
			},
			select: {
				id: true,
				status: true,
				requestedName: true,
				requesterUser: {
					select: {
						discordUserId: true
					}
				}
			}
		});
	});
}
