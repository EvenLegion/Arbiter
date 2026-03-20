import { NameChangeRequestStatus } from '@prisma/client';
import { z } from 'zod';

import { DISCORD_MAX_NICKNAME_LENGTH } from '../../../lib/constants';
import { prisma } from '../prisma';

const UPDATE_PENDING_NAME_CHANGE_REQUEST_REQUESTED_NAME_SCHEMA = z.object({
	requestId: z.number().int().positive(),
	requestedName: z.string().trim().min(1).max(DISCORD_MAX_NICKNAME_LENGTH)
});

export async function updatePendingNameChangeRequestRequestedName(params: { requestId: number; requestedName: string }) {
	const parsed = UPDATE_PENDING_NAME_CHANGE_REQUEST_REQUESTED_NAME_SCHEMA.parse(params);

	return prisma.$transaction(async (tx) => {
		const updated = await tx.nameChangeRequest.updateMany({
			where: {
				id: parsed.requestId,
				status: NameChangeRequestStatus.PENDING
			},
			data: {
				requestedName: parsed.requestedName
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
