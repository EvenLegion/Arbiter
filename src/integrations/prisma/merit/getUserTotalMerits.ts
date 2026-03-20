import { prisma } from '../prisma';
import { GET_USER_TOTAL_MERITS_SCHEMA, TOTAL_MERITS_ROW_SCHEMA, type GetUserTotalMeritsParams } from './meritReadTypes';

export async function getUserTotalMerits(params: GetUserTotalMeritsParams): Promise<number> {
	const parsed = GET_USER_TOTAL_MERITS_SCHEMA.parse(params);

	const rows = await prisma.$queryRaw<Array<{ total: number | bigint | string }>>`
		SELECT COALESCE(SUM("mt"."meritAmount"), 0) AS total
		FROM "Merit" AS "m"
		INNER JOIN "MeritType" AS "mt" ON "mt"."id" = "m"."meritTypeId"
		WHERE "m"."userId" = ${parsed.userDbUserId}
	`;

	return TOTAL_MERITS_ROW_SCHEMA.parse(rows[0] ?? { total: 0 }).total;
}
