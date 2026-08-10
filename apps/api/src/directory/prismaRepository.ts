import { MERIT_RANK_THRESHOLDS } from '@arbiter/domain';
import { ApiDirectoryMembershipSchema } from '@arbiter/api-contracts';
import { Prisma, type PrismaClient } from '@prisma/client';

import type { DirectoryRepository, DirectoryRepositoryQuery, DirectoryRepositoryRow } from './types';

type RawDirectoryRow = {
	discordUserId: string;
	memberships: unknown;
	totalMerits: bigint | number | string;
	rankLevel: number | bigint | null;
};

export function createPrismaDirectoryRepository(prisma: PrismaClient): DirectoryRepository {
	return {
		query: async (input, signal, deadlineAtMs) => {
			signal?.throwIfAborted();
			const remainingMs = deadlineAtMs === undefined ? undefined : Math.floor(deadlineAtMs - Date.now());
			if (remainingMs !== undefined && remainingMs <= 0) throw new Error('Directory query deadline exceeded');
			const execute = async (tx: Prisma.TransactionClient) => {
				signal?.throwIfAborted();
				await applyStatementDeadline(tx, deadlineAtMs);
				const knownDivisionCodes = input.divisionCodesAny
					? await tx.division.findMany({ where: { code: { in: input.divisionCodesAny } }, select: { code: true } })
					: [];
				const knownCodeSet = new Set(knownDivisionCodes.map(({ code }) => code));
				const unknownDivisionCodes = input.divisionCodesAny?.filter((code) => !knownCodeSet.has(code)) ?? [];
				if (unknownDivisionCodes.length > 0) return { rows: [], unknownDivisionCodes };

				signal?.throwIfAborted();
				await applyStatementDeadline(tx, deadlineAtMs);
				const rawRows = await tx.$queryRaw<RawDirectoryRow[]>(buildDirectorySql(input));
				signal?.throwIfAborted();
				return { rows: rawRows.map(mapDirectoryRow), unknownDivisionCodes: [] };
			};
			if (remainingMs === undefined) {
				return prisma.$transaction(execute, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
			}
			return prisma.$transaction(execute, {
				isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
				maxWait: remainingMs,
				timeout: remainingMs
			});
		}
	};
}

async function applyStatementDeadline(tx: Prisma.TransactionClient, deadlineAtMs: number | undefined): Promise<void> {
	if (deadlineAtMs === undefined) return;
	const remainingMs = Math.floor(deadlineAtMs - Date.now());
	if (remainingMs <= 0) throw new Error('Directory query deadline exceeded');
	await tx.$queryRaw`SELECT set_config('statement_timeout', ${`${remainingMs}ms`}, true)`;
}

export function buildDirectorySql(input: DirectoryRepositoryQuery): Prisma.Sql {
	const thresholds = Prisma.join(
		MERIT_RANK_THRESHOLDS.map(({ level, cumulativeMerits }) => Prisma.sql`(${level}::int, ${cumulativeMerits}::bigint)`)
	);
	const candidateConditions: Prisma.Sql[] = [];
	if (input.discordUserIds) candidateConditions.push(Prisma.sql`"user"."discordUserId" IN (${Prisma.join(input.discordUserIds)})`);
	if (input.afterDiscordUserId) candidateConditions.push(Prisma.sql`"user"."discordUserId" > ${input.afterDiscordUserId}`);
	if (input.divisionCodesAny) {
		candidateConditions.push(Prisma.sql`EXISTS (
			SELECT 1
			FROM "DivisionMembership" AS "filterMembership"
			INNER JOIN "Division" AS "filterDivision" ON "filterDivision"."id" = "filterMembership"."divisionId"
			WHERE "filterMembership"."userId" = "user"."id"
				AND "filterDivision"."code" IN (${Prisma.join(input.divisionCodesAny)})
		)`);
	}
	const rankConditions: Prisma.Sql[] = [];
	if (input.exactRank !== undefined) rankConditions.push(Prisma.sql`"ranked"."rankLevel" = ${input.exactRank}`);
	if (input.minimumRank !== undefined) rankConditions.push(Prisma.sql`"ranked"."rankLevel" >= ${input.minimumRank}`);
	if (input.maximumRank !== undefined) rankConditions.push(Prisma.sql`"ranked"."rankLevel" <= ${input.maximumRank}`);
	const candidateWhere = candidateConditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(candidateConditions, ' AND ')}` : Prisma.empty;
	const rankWhere = rankConditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(rankConditions, ' AND ')}` : Prisma.empty;
	const candidateLimit = rankConditions.length === 0 ? Prisma.sql`LIMIT ${input.limit}` : Prisma.empty;

	return Prisma.sql`
		WITH "candidateUsers" AS (
			SELECT "user"."id" AS "userId", "user"."discordUserId" AS "discordUserId"
			FROM "User" AS "user"
			${candidateWhere}
			ORDER BY "user"."discordUserId" ASC
			${candidateLimit}
		),
		"meritTotals" AS (
			SELECT
				"candidate"."userId" AS "userId",
				COALESCE(SUM("meritType"."meritAmount"), 0)::bigint AS "totalMerits"
			FROM "candidateUsers" AS "candidate"
			LEFT JOIN "Merit" AS "merit" ON "merit"."userId" = "candidate"."userId"
			LEFT JOIN "MeritType" AS "meritType" ON "meritType"."id" = "merit"."meritTypeId"
			GROUP BY "candidate"."userId"
		),
		"rankThresholds" ("level", "minimumMerits") AS (
			VALUES ${thresholds}
		),
		"rankedUsers" AS (
			SELECT
				"candidate"."userId" AS "userId",
				"candidate"."discordUserId" AS "discordUserId",
				"totals"."totalMerits" AS "totalMerits",
				(
					SELECT MAX("threshold"."level")::int
					FROM "rankThresholds" AS "threshold"
					WHERE "threshold"."minimumMerits" <= "totals"."totalMerits"
				) AS "rankLevel"
			FROM "candidateUsers" AS "candidate"
			INNER JOIN "meritTotals" AS "totals" ON "totals"."userId" = "candidate"."userId"
		),
		"pageUsers" AS (
			SELECT "ranked".*
			FROM "rankedUsers" AS "ranked"
			${rankWhere}
			ORDER BY "ranked"."discordUserId" ASC
			LIMIT ${input.limit}
		)
		SELECT
			"page"."discordUserId" AS "discordUserId",
			"page"."totalMerits" AS "totalMerits",
			"page"."rankLevel" AS "rankLevel",
			COALESCE(
				jsonb_agg(
					jsonb_build_object(
						'divisionCode', "division"."code",
						'divisionName', "division"."name",
						'divisionKind', "division"."kind"::text
					)
					ORDER BY "division"."code" ASC
				) FILTER (WHERE "membership"."id" IS NOT NULL),
				'[]'::jsonb
			) AS "memberships"
		FROM "pageUsers" AS "page"
		LEFT JOIN "DivisionMembership" AS "membership" ON "membership"."userId" = "page"."userId"
		LEFT JOIN "Division" AS "division" ON "division"."id" = "membership"."divisionId"
		GROUP BY "page"."userId", "page"."discordUserId", "page"."totalMerits", "page"."rankLevel"
		ORDER BY "page"."discordUserId" ASC
	`;
}

function mapDirectoryRow(row: RawDirectoryRow): DirectoryRepositoryRow {
	const totalMerits = Number(row.totalMerits);
	if (!Number.isSafeInteger(totalMerits)) throw new Error('Directory merit total exceeds the safe integer range');
	const rankLevel = row.rankLevel === null ? null : Number(row.rankLevel);
	if (rankLevel !== null && !Number.isSafeInteger(rankLevel)) throw new Error('Directory rank level is invalid');
	return {
		discordUserId: row.discordUserId,
		memberships: ApiDirectoryMembershipSchema.array().parse(row.memberships),
		totalMerits,
		rankLevel
	};
}
