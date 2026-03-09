import { z } from 'zod';
import { prisma } from './prisma';

type GetUserTotalMeritsParams = {
	userDbUserId: string;
};

const GET_USER_TOTAL_MERITS_SCHEMA = z.object({
	userDbUserId: z.string().min(1)
});
const TOTAL_ROW_SCHEMA = z.object({
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

export async function getUserTotalMerits(params: GetUserTotalMeritsParams): Promise<number> {
	const parsed = GET_USER_TOTAL_MERITS_SCHEMA.parse(params);

	const rows = await prisma.$queryRaw<Array<{ total: number | bigint | string }>>`
		SELECT COALESCE(SUM("mt"."meritAmount"), 0) AS total
		FROM "Merit" AS "m"
		INNER JOIN "MeritType" AS "mt" ON "mt"."id" = "m"."meritTypeId"
		WHERE "m"."userId" = ${parsed.userDbUserId}
	`;
	const totalRow = TOTAL_ROW_SCHEMA.parse(rows[0] ?? { total: 0 });

	return totalRow.total;
}
