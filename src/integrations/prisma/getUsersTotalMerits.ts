import { z } from 'zod';
import { prisma } from './prisma';

type GetUsersTotalMeritsParams = {
	userDbUserIds: string[];
};

const GET_USERS_TOTAL_MERITS_SCHEMA = z.object({
	userDbUserIds: z.array(z.string().min(1)).default([])
});

export async function getUsersTotalMerits(params: GetUsersTotalMeritsParams): Promise<Map<string, number>> {
	const parsed = GET_USERS_TOTAL_MERITS_SCHEMA.parse(params);
	const uniqueUserDbUserIds = [...new Set(parsed.userDbUserIds)];
	if (uniqueUserDbUserIds.length === 0) {
		return new Map();
	}

	const groupedRows = await prisma.merit.groupBy({
		by: ['userId'],
		where: {
			userId: {
				in: uniqueUserDbUserIds
			}
		},
		_sum: {
			amount: true
		}
	});

	const totalsByUserId = new Map<string, number>();
	for (const userDbUserId of uniqueUserDbUserIds) {
		totalsByUserId.set(userDbUserId, 0);
	}
	for (const row of groupedRows) {
		totalsByUserId.set(row.userId, row._sum.amount ?? 0);
	}

	return totalsByUserId;
}
