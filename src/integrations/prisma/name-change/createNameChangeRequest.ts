import { z } from 'zod';

import { DISCORD_MAX_NICKNAME_LENGTH } from '../../../lib/constants';
import { prisma } from '../prisma';

const CREATE_NAME_CHANGE_REQUEST_SCHEMA = z.object({
	requesterDbUserId: z.string().min(1),
	currentName: z.string().trim().min(1).max(100),
	requestedName: z.string().trim().min(1).max(DISCORD_MAX_NICKNAME_LENGTH),
	reason: z.string().trim().min(1).max(1_000)
});

export async function createNameChangeRequest(params: { requesterDbUserId: string; currentName: string; requestedName: string; reason: string }) {
	const parsed = CREATE_NAME_CHANGE_REQUEST_SCHEMA.parse(params);

	return prisma.nameChangeRequest.create({
		data: {
			requesterUserId: parsed.requesterDbUserId,
			currentName: parsed.currentName,
			requestedName: parsed.requestedName,
			reason: parsed.reason
		}
	});
}
