import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { resolveMeritRankLevel } from '../../src/lib/features/merit/meritRank';
import { redactConnectionString, requiredEnv } from './env';

type GuildUserRecord = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
};

type RankMismatchEntry = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	userId: string | null;
	oldTotalMerits: number | null;
	newTotalMerits: number | null;
	totalMeritDelta: number | null;
	oldComputedMeritRankLevel: number | null;
	newComputedMeritRankLevel: number | null;
	reason: 'MISSING_USER' | 'RANK_MISMATCH' | 'ROUNDED_CENTURION_MERITS';
};

const SOURCE_DATABASE_URL = requiredEnv('MIGRATION_SOURCE_DATABASE_URL');
const TARGET_DATABASE_URL = requiredEnv(['MIGRATION_TARGET_DATABASE_URL', 'DATABASE_URL']);
const INPUT_PATH = 'data/discord-guild-users.json';
const OUTPUT_PATH = 'data/merit-rank-mismatches.json';

function isGuildUserRecord(value: unknown): value is GuildUserRecord {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.discordUserId === 'string' && typeof candidate.discordUsername === 'string' && typeof candidate.discordNickname === 'string'
	);
}

async function readCache(): Promise<GuildUserRecord[]> {
	const raw = await readFile(INPUT_PATH, 'utf8');
	const parsed = JSON.parse(raw) as Record<string, unknown>;

	const users: GuildUserRecord[] = [];
	for (const value of Object.values(parsed)) {
		if (isGuildUserRecord(value)) {
			users.push(value);
		}
	}

	return users;
}

async function loadLegacyTotalsByDiscordUserId(sourcePool: Pool, discordUserIds: string[]): Promise<Map<string, number>> {
	const uniqueDiscordUserIds = [...new Set(discordUserIds)];
	if (uniqueDiscordUserIds.length === 0) {
		return new Map();
	}

	const rows = await sourcePool.query<Array<{ discordUserId: string; total: number | bigint | string }>>(
		`SELECT "userID" AS "discordUserId", COALESCE(SUM(merits), 0) AS total
		 FROM "arbiter"."merit"
		 WHERE "userID" = ANY($1::text[])
		 GROUP BY "userID"`,
		[uniqueDiscordUserIds]
	);

	const totalsByDiscordUserId = new Map<string, number>();
	for (const discordUserId of uniqueDiscordUserIds) {
		totalsByDiscordUserId.set(discordUserId, 0);
	}
	for (const row of rows.rows) {
		const total = typeof row.total === 'number' ? row.total : typeof row.total === 'bigint' ? Number(row.total) : Number.parseInt(row.total, 10);
		totalsByDiscordUserId.set(row.discordUserId, Number.isFinite(total) ? total : 0);
	}

	return totalsByDiscordUserId;
}

async function loadLegacyRoundedCenturionDeltaByDiscordUserId(sourcePool: Pool, discordUserIds: string[]): Promise<Map<string, number>> {
	const uniqueDiscordUserIds = [...new Set(discordUserIds)];
	if (uniqueDiscordUserIds.length === 0) {
		return new Map();
	}

	const rows = await sourcePool.query<Array<{ discordUserId: string; roundedDelta: number | bigint | string }>>(
		`SELECT "userID" AS "discordUserId",
		        COUNT(*) FILTER (WHERE "typeId" = 4 AND merits > 1 AND MOD(merits, 2) = 1) AS "roundedDelta"
		 FROM "arbiter"."merit"
		 WHERE "userID" = ANY($1::text[])
		 GROUP BY "userID"`,
		[uniqueDiscordUserIds]
	);

	const roundedDeltaByDiscordUserId = new Map<string, number>();
	for (const discordUserId of uniqueDiscordUserIds) {
		roundedDeltaByDiscordUserId.set(discordUserId, 0);
	}
	for (const row of rows.rows) {
		const roundedDelta =
			typeof row.roundedDelta === 'number'
				? row.roundedDelta
				: typeof row.roundedDelta === 'bigint'
					? Number(row.roundedDelta)
					: Number.parseInt(row.roundedDelta, 10);
		roundedDeltaByDiscordUserId.set(row.discordUserId, Number.isFinite(roundedDelta) ? roundedDelta : 0);
	}

	return roundedDeltaByDiscordUserId;
}

async function loadTargetTotalsByUserId(prisma: PrismaClient, userIds: string[]): Promise<Map<string, number>> {
	const uniqueUserIds = [...new Set(userIds)];
	if (uniqueUserIds.length === 0) {
		return new Map();
	}

	const rows = await prisma.$queryRaw<Array<{ userId: string; total: number | bigint | string }>>`
		SELECT "m"."userId", COALESCE(SUM("mt"."meritAmount"), 0) AS total
		FROM "Merit" AS "m"
		INNER JOIN "MeritType" AS "mt" ON "mt"."id" = "m"."meritTypeId"
		WHERE "m"."userId" IN (${Prisma.join(uniqueUserIds)})
		GROUP BY "m"."userId"
	`;

	const totalsByUserId = new Map<string, number>();
	for (const userId of uniqueUserIds) {
		totalsByUserId.set(userId, 0);
	}
	for (const row of rows) {
		const total = typeof row.total === 'number' ? row.total : typeof row.total === 'bigint' ? Number(row.total) : Number.parseInt(row.total, 10);
		totalsByUserId.set(row.userId, Number.isFinite(total) ? total : 0);
	}

	return totalsByUserId;
}

async function writeMismatchReport({
	totalCacheUsers,
	totalComparedUsers,
	missingUsers,
	mismatchEntries
}: {
	totalCacheUsers: number;
	totalComparedUsers: number;
	missingUsers: number;
	mismatchEntries: RankMismatchEntry[];
}): Promise<void> {
	const payload = {
		generatedAt: new Date().toISOString(),
		inputPath: INPUT_PATH,
		totalCacheUsers,
		totalComparedUsers,
		verificationMode: 'legacy-vs-target-merit-rank-using-new-rank-logic',
		mismatchCount: mismatchEntries.length,
		missingUsers,
		mismatches: mismatchEntries
	};

	await mkdir(dirname(OUTPUT_PATH), { recursive: true });
	await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
	console.log(`Input path: ${INPUT_PATH}`);
	console.log(`Output path: ${OUTPUT_PATH}`);
	console.log(`Source DB: ${redactConnectionString(SOURCE_DATABASE_URL)}`);
	console.log(`Target DB: ${redactConnectionString(TARGET_DATABASE_URL)}`);
	console.log('Verification mode: legacy-vs-target merit rank using new rank logic');

	const cachedUsers = await readCache();
	const usersToCompare = cachedUsers;

	const sourcePool = new Pool({ connectionString: SOURCE_DATABASE_URL });
	const targetPool = new Pool({ connectionString: TARGET_DATABASE_URL });
	const prisma = new PrismaClient({
		adapter: new PrismaPg(targetPool)
	});

	try {
		const users = await prisma.user.findMany({
			where: {
				discordUserId: {
					in: usersToCompare.map((user) => user.discordUserId)
				}
			},
			select: {
				id: true,
				discordUserId: true
			}
		});

		const userIdByDiscordUserId = new Map(users.map((user) => [user.discordUserId, user.id]));
		const legacyTotalsByDiscordUserId = await loadLegacyTotalsByDiscordUserId(
			sourcePool,
			usersToCompare.map((user) => user.discordUserId)
		);
		const legacyRoundedCenturionDeltaByDiscordUserId = await loadLegacyRoundedCenturionDeltaByDiscordUserId(
			sourcePool,
			usersToCompare.map((user) => user.discordUserId)
		);
		const targetTotalsByUserId = await loadTargetTotalsByUserId(
			prisma,
			users.map((user) => user.id)
		);

		const mismatchEntries: RankMismatchEntry[] = [];
		let missingUsers = 0;

		for (const user of usersToCompare) {
			const oldTotalMerits = legacyTotalsByDiscordUserId.get(user.discordUserId) ?? 0;
			const oldComputedMeritRankLevel = resolveMeritRankLevel(oldTotalMerits);
			const userId = userIdByDiscordUserId.get(user.discordUserId) ?? null;

			if (!userId) {
				missingUsers += 1;
				mismatchEntries.push({
					discordUserId: user.discordUserId,
					discordUsername: user.discordUsername,
					discordNickname: user.discordNickname,
					userId: null,
					oldTotalMerits,
					newTotalMerits: null,
					totalMeritDelta: null,
					oldComputedMeritRankLevel,
					newComputedMeritRankLevel: null,
					reason: 'MISSING_USER'
				});
				continue;
			}

			const newTotalMerits = targetTotalsByUserId.get(userId) ?? 0;
			const newComputedMeritRankLevel = resolveMeritRankLevel(newTotalMerits);
			if (newComputedMeritRankLevel !== oldComputedMeritRankLevel) {
				const totalMeritDelta = newTotalMerits - oldTotalMerits;
				const roundedCenturionDelta = legacyRoundedCenturionDeltaByDiscordUserId.get(user.discordUserId) ?? 0;
				const reason: RankMismatchEntry['reason'] =
					totalMeritDelta > 0 && totalMeritDelta === roundedCenturionDelta && roundedCenturionDelta > 0
						? 'ROUNDED_CENTURION_MERITS'
						: 'RANK_MISMATCH';

				mismatchEntries.push({
					discordUserId: user.discordUserId,
					discordUsername: user.discordUsername,
					discordNickname: user.discordNickname,
					userId,
					oldTotalMerits,
					newTotalMerits,
					totalMeritDelta,
					oldComputedMeritRankLevel,
					newComputedMeritRankLevel,
					reason
				});
			}
		}

		mismatchEntries.sort((left, right) => {
			const leftDelta = Math.abs(left.totalMeritDelta ?? 0);
			const rightDelta = Math.abs(right.totalMeritDelta ?? 0);
			if (leftDelta !== rightDelta) {
				return rightDelta - leftDelta;
			}

			return left.discordUserId.localeCompare(right.discordUserId);
		});

		await writeMismatchReport({
			totalCacheUsers: cachedUsers.length,
			totalComparedUsers: usersToCompare.length,
			missingUsers,
			mismatchEntries
		});

		console.log('Merit rank verification finished');
		console.table({
			totalCacheUsers: cachedUsers.length,
			totalComparedUsers: usersToCompare.length,
			missingUsers,
			mismatchCount: mismatchEntries.length
		});
	} finally {
		await prisma.$disconnect();
		await sourcePool.end();
		await targetPool.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
