import { Prisma } from '@prisma/client';

import { prisma } from '../prisma';
import { USER_MERIT_RANK_DIVISION_ROW_SCHEMA, type MeritRankBreakdownEntry } from './meritReadTypes';
import { MAX_MERIT_RANK_LEVEL, resolveMeritRankLevel } from '../../../lib/services/merit-rank/meritRank';

const TRACKED_DIVISION_CODES = ['LGN', 'RES', 'CENT', 'OPT', 'NVY', 'NVY-L', 'MRN', 'MRN-L', 'SUP', 'SUP-L'] as const;

type MeritRankDivisionRow = {
	userId: string;
	total: number | bigint | string;
	hasLgn: number | bigint | string | boolean;
	hasRes: number | bigint | string | boolean;
	hasCent: number | bigint | string | boolean;
	hasOpt: number | bigint | string | boolean;
	hasNvy: number | bigint | string | boolean;
	hasNvyL: number | bigint | string | boolean;
	hasMrn: number | bigint | string | boolean;
	hasMrnL: number | bigint | string | boolean;
	hasSup: number | bigint | string | boolean;
	hasSupL: number | bigint | string | boolean;
};

export async function getMeritRankBreakdown(): Promise<MeritRankBreakdownEntry[]> {
	const rawRows = await prisma.$queryRaw<MeritRankDivisionRow[]>`
		WITH "merit_totals" AS (
			SELECT "m"."userId", COALESCE(SUM("mt"."meritAmount"), 0) AS "total"
			FROM "Merit" AS "m"
			INNER JOIN "MeritType" AS "mt" ON "mt"."id" = "m"."meritTypeId"
			GROUP BY "m"."userId"
		)
		SELECT
			"u"."id" AS "userId",
			COALESCE("totals"."total", 0) AS "total",
			COALESCE(MAX(CASE WHEN "d"."code" = 'LGN' THEN 1 ELSE 0 END), 0) AS "hasLgn",
			COALESCE(MAX(CASE WHEN "d"."code" = 'RES' THEN 1 ELSE 0 END), 0) AS "hasRes",
			COALESCE(MAX(CASE WHEN "d"."code" = 'CENT' THEN 1 ELSE 0 END), 0) AS "hasCent",
			COALESCE(MAX(CASE WHEN "d"."code" = 'OPT' THEN 1 ELSE 0 END), 0) AS "hasOpt",
			COALESCE(MAX(CASE WHEN "d"."code" = 'NVY' THEN 1 ELSE 0 END), 0) AS "hasNvy",
			COALESCE(MAX(CASE WHEN "d"."code" = 'NVY-L' THEN 1 ELSE 0 END), 0) AS "hasNvyL",
			COALESCE(MAX(CASE WHEN "d"."code" = 'MRN' THEN 1 ELSE 0 END), 0) AS "hasMrn",
			COALESCE(MAX(CASE WHEN "d"."code" = 'MRN-L' THEN 1 ELSE 0 END), 0) AS "hasMrnL",
			COALESCE(MAX(CASE WHEN "d"."code" = 'SUP' THEN 1 ELSE 0 END), 0) AS "hasSup",
			COALESCE(MAX(CASE WHEN "d"."code" = 'SUP-L' THEN 1 ELSE 0 END), 0) AS "hasSupL"
		FROM "User" AS "u"
		LEFT JOIN "merit_totals" AS "totals" ON "totals"."userId" = "u"."id"
		LEFT JOIN "DivisionMembership" AS "dm" ON "dm"."userId" = "u"."id"
		LEFT JOIN "Division" AS "d"
			ON "d"."id" = "dm"."divisionId"
			AND "d"."code" IN (${Prisma.join(TRACKED_DIVISION_CODES)})
		GROUP BY "u"."id", "totals"."total"
		ORDER BY "u"."id" ASC
	`;

	const rows = rawRows.map((row) => USER_MERIT_RANK_DIVISION_ROW_SCHEMA.parse(row));
	const countsByLevel = new Map<number, MeritRankBreakdownEntry>();

	for (let level = 1; level <= MAX_MERIT_RANK_LEVEL; level++) {
		countsByLevel.set(level, {
			level,
			lgnOrResCount: 0,
			lgnCount: 0,
			resCount: 0,
			centCount: 0,
			optCount: 0,
			nvyCount: 0,
			nvyLCount: 0,
			mrnCount: 0,
			mrnLCount: 0,
			supCount: 0,
			supLCount: 0
		});
	}

	for (const row of rows) {
		const level = resolveMeritRankLevel(row.total);
		if (!level) {
			continue;
		}

		const counts = countsByLevel.get(level);
		if (!counts) {
			continue;
		}

		if (row.hasLgn || row.hasRes) {
			counts.lgnOrResCount += 1;
		}
		if (row.hasLgn) {
			counts.lgnCount += 1;
		}
		if (row.hasRes) {
			counts.resCount += 1;
		}
		if (row.hasCent) {
			counts.centCount += 1;
		}
		if (row.hasOpt) {
			counts.optCount += 1;
		}
		if (row.hasNvy) {
			counts.nvyCount += 1;
		}
		if (row.hasNvyL) {
			counts.nvyLCount += 1;
		}
		if (row.hasMrn) {
			counts.mrnCount += 1;
		}
		if (row.hasMrnL) {
			counts.mrnLCount += 1;
		}
		if (row.hasSup) {
			counts.supCount += 1;
		}
		if (row.hasSupL) {
			counts.supLCount += 1;
		}
	}

	return [...countsByLevel.values()];
}
