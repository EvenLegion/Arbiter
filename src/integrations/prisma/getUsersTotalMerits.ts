import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';

type GetUsersTotalMeritsParams = {
	userDbUserIds: string[];
};

const GET_USERS_TOTAL_MERITS_SCHEMA = z.object({
	userDbUserIds: z.array(z.string().min(1)).default([])
});
const USER_TOTAL_ROW_SCHEMA = z.object({
	userId: z.string().min(1),
	total: z.union([z.number(), z.bigint(), z.string()]).transform((value) => {
		if (typeof value === 'number') {
			return value;
		}
		if (typeof value === 'bigint') {
			return Number(value);
		}
		return Number.parseInt(value, 10);
	})
});

export async function getUsersTotalMerits(params: GetUsersTotalMeritsParams): Promise<Map<string, number>> {
	const parsed = GET_USERS_TOTAL_MERITS_SCHEMA.parse(params);
	const uniqueUserDbUserIds = [...new Set(parsed.userDbUserIds)];
	if (uniqueUserDbUserIds.length === 0) {
		return new Map();
	}

	const rawRows = await prisma.$queryRaw<Array<{ userId: string; total: number | bigint | string }>>`
		SELECT "m"."userId", COALESCE(SUM("mt"."meritAmount"), 0) AS total
		FROM "Merit" AS "m"
		INNER JOIN "MeritType" AS "mt" ON "mt"."id" = "m"."meritTypeId"
		WHERE "m"."userId" IN (${Prisma.join(uniqueUserDbUserIds)})
		GROUP BY "m"."userId"
	`;
	const groupedRows = rawRows.map((row) => USER_TOTAL_ROW_SCHEMA.parse(row));

	const totalsByUserId = new Map<string, number>();
	for (const userDbUserId of uniqueUserDbUserIds) {
		totalsByUserId.set(userDbUserId, 0);
	}
	for (const row of groupedRows) {
		totalsByUserId.set(row.userId, row.total);
	}

	return totalsByUserId;
}
