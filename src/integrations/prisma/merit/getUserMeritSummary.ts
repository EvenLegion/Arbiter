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

		const meritRows = await tx.merit.findMany({
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
				awardedByUserId: true,
				meritTypeId: true,
				eventSessionId: true
			}
		});
		const awarderIds = [...new Set(meritRows.map((entry) => entry.awardedByUserId))];
		const meritTypeIds = [...new Set(meritRows.map((entry) => entry.meritTypeId))];
		const eventSessionIds = [
			...new Set(meritRows.map((entry) => entry.eventSessionId).filter((eventSessionId): eventSessionId is number => eventSessionId !== null))
		];
		const awarders = await tx.user.findMany({
			where: {
				id: {
					in: awarderIds
				}
			},
			select: {
				id: true,
				discordNickname: true,
				discordUsername: true
			}
		});
		const meritTypes = await tx.meritType.findMany({
			where: {
				id: {
					in: meritTypeIds
				}
			},
			select: {
				id: true,
				meritAmount: true,
				name: true
			}
		});
		const eventSessions = await tx.event.findMany({
			where: {
				id: {
					in: eventSessionIds
				}
			},
			select: {
				id: true,
				name: true
			}
		});
		const awarderById = new Map(awarders.map((awarder) => [awarder.id, awarder]));
		const meritTypeById = new Map(meritTypes.map((meritType) => [meritType.id, meritType]));
		const eventSessionById = new Map(eventSessions.map((eventSession) => [eventSession.id, eventSession]));

		return {
			totalMerits,
			totalAwards,
			totalLinkedEvents: linkedEventsCount,
			page: resolvedPage,
			pageSize: parsed.pageSize,
			totalPages,
			entries: meritRows.map((entry) => {
				const awarder = awarderById.get(entry.awardedByUserId);
				const meritType = meritTypeById.get(entry.meritTypeId);
				if (!awarder || !meritType) {
					throw new Error(`Merit ${entry.id} references missing required records.`);
				}

				return {
					id: entry.id,
					amount: meritType.meritAmount,
					meritTypeName: meritType.name,
					awardedByName: awarder.discordNickname || awarder.discordUsername,
					reason: entry.reason,
					createdAt: entry.createdAt,
					eventSession: entry.eventSessionId === null ? null : (eventSessionById.get(entry.eventSessionId) ?? null)
				};
			})
		};
	});
}
