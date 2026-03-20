import { prisma } from '../prisma';
import {
	GET_USER_MERIT_SUMMARY_SCHEMA,
	LINKED_EVENTS_COUNT_ROW_SCHEMA,
	TOTAL_MERITS_ROW_SCHEMA,
	type GetUserMeritSummaryParams,
	type UserMeritSummary
} from './meritReadTypes';

export async function getUserMeritSummary(params: GetUserMeritSummaryParams): Promise<UserMeritSummary> {
	const parsed = GET_USER_MERIT_SUMMARY_SCHEMA.parse(params);

	return prisma.$transaction(async (tx) => {
		const totalsRows = await tx.$queryRaw<Array<{ total: number | bigint | string }>>`
			SELECT COALESCE(SUM("mt"."meritAmount"), 0) AS total
			FROM "Merit" AS "m"
			INNER JOIN "MeritType" AS "mt" ON "mt"."id" = "m"."meritTypeId"
			WHERE "m"."userId" = ${parsed.userDbUserId}
		`;
		const totalMerits = TOTAL_MERITS_ROW_SCHEMA.parse(totalsRows[0] ?? { total: 0 }).total;
		const totalAwards = await tx.merit.count({
			where: {
				userId: parsed.userDbUserId
			}
		});
		const linkedEventsCountRows = await tx.$queryRaw<Array<{ count: number | bigint | string }>>`
			SELECT COUNT(DISTINCT "eventSessionId") AS count
			FROM "Merit"
			WHERE "userId" = ${parsed.userDbUserId}
			  AND "eventSessionId" IS NOT NULL
		`;
		const linkedEventsCount = LINKED_EVENTS_COUNT_ROW_SCHEMA.parse(linkedEventsCountRows[0] ?? { count: 0 }).count;

		const totalPages = Math.max(1, Math.ceil(totalAwards / parsed.pageSize));
		const resolvedPage = Math.min(parsed.page, totalPages);
		const skip = (resolvedPage - 1) * parsed.pageSize;

		const entries = await tx.merit.findMany({
			where: {
				userId: parsed.userDbUserId
			},
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			skip,
			take: parsed.pageSize,
			select: {
				id: true,
				reason: true,
				createdAt: true,
				awardedByUser: {
					select: {
						discordNickname: true,
						discordUsername: true
					}
				},
				meritType: {
					select: {
						meritAmount: true,
						name: true
					}
				},
				eventSession: {
					select: {
						id: true,
						name: true
					}
				}
			}
		});

		return {
			totalMerits,
			totalAwards,
			totalLinkedEvents: linkedEventsCount,
			page: resolvedPage,
			pageSize: parsed.pageSize,
			totalPages,
			entries: entries.map((entry) => ({
				id: entry.id,
				amount: entry.meritType.meritAmount,
				meritTypeName: entry.meritType.name,
				awardedByName: entry.awardedByUser.discordNickname || entry.awardedByUser.discordUsername,
				reason: entry.reason,
				createdAt: entry.createdAt,
				eventSession: entry.eventSession
			}))
		};
	});
}
