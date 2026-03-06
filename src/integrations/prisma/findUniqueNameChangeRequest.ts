import { NameChangeRequestStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';

type FindUniqueNameChangeRequestParams = {
	requestId: number;
};

const FIND_UNIQUE_NAME_CHANGE_REQUEST_SCHEMA = z.object({
	requestId: z.number().int().positive()
});

export async function findUniqueNameChangeRequest({ requestId }: FindUniqueNameChangeRequestParams) {
	const parsed = FIND_UNIQUE_NAME_CHANGE_REQUEST_SCHEMA.parse({
		requestId
	});

	return prisma.nameChangeRequest.findUnique({
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
}

export function isPendingNameChangeRequestStatus(status: NameChangeRequestStatus) {
	return status === NameChangeRequestStatus.PENDING;
}
