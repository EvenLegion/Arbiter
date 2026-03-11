import { PrismaPg } from '@prisma/adapter-pg';
import { MeritTypeCode, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { redactConnectionString, requiredEnv } from './env';

type OldEventMeritRow = {
	id: number;
	userID: string;
	awardedBy: string;
	description: string;
	additionalNotes: string;
	typeId: number;
	merits: number;
	createdAt: Date;
	updatedAt: Date;
};

type OldEventSessionRootRow = {
	id: number;
	rootSessionId: number | null;
};

const SOURCE_DATABASE_URL = requiredEnv('MIGRATION_SOURCE_DATABASE_URL');
const TARGET_DATABASE_URL = requiredEnv(['MIGRATION_TARGET_DATABASE_URL', 'DATABASE_URL']);

const ARBITER_SYSTEM_DISCORD_USER_ID = '1376748367731884063';
const ARBITER_SYSTEM_USERNAME = 'arbiter-system';
const ARBITER_SYSTEM_NICKNAME = 'Arbiter';
const ARBITER_SYSTEM_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';

const DRY_RUN = false;
const FAIL_FAST = true;
const BATCH_SIZE = 1000;

const EVENT_SESSION_ID_REGEX = /event session (\d+)/i;
const OLD_EVENT_MERIT_TYPE_TO_NEW_CODE: Record<number, MeritTypeCode> = {
	10: MeritTypeCode.TIER_0,
	1: MeritTypeCode.TIER_3,
	2: MeritTypeCode.TIER_2,
	3: MeritTypeCode.TIER_1,
	9: MeritTypeCode.TRAINING
};
const INCLUDED_OLD_EVENT_MERIT_TYPE_IDS = Object.keys(OLD_EVENT_MERIT_TYPE_TO_NEW_CODE).map(Number);

function buildReason(description: string, additionalNotes: string): string {
	const trimmedDescription = description.trim();
	if (trimmedDescription.length > 0) {
		return trimmedDescription;
	}

	const trimmedAdditionalNotes = additionalNotes.trim();
	if (trimmedAdditionalNotes.length > 0) {
		return trimmedAdditionalNotes;
	}

	return 'Awarded for attending';
}

function parseLegacyEventSessionId(value: string): number | null {
	const match = value.match(EVENT_SESSION_ID_REGEX);
	if (!match) {
		return null;
	}

	const parsed = Number.parseInt(match[1] ?? '', 10);
	return Number.isInteger(parsed) ? parsed : null;
}

function resolveMeritTypeCodeForLegacyRow({
	preferredCode,
	oldMerits,
	meritAmountByCode
}: {
	preferredCode: MeritTypeCode;
	oldMerits: number;
	meritAmountByCode: Map<MeritTypeCode, number>;
}): MeritTypeCode | null {
	const preferredAmount = meritAmountByCode.get(preferredCode);
	if (preferredAmount === oldMerits) {
		return preferredCode;
	}

	switch (oldMerits) {
		case 0:
			return MeritTypeCode.TIER_0;
		case 1:
			if (preferredCode === MeritTypeCode.TIER_1 || preferredCode === MeritTypeCode.TIER_2) {
				return preferredCode;
			}
			return MeritTypeCode.TIER_1;
		case 2:
			return MeritTypeCode.TRAINING;
		case 3:
			return MeritTypeCode.TIER_3;
		default:
			return null;
	}
}

async function main() {
	console.log(`Source DB: ${redactConnectionString(SOURCE_DATABASE_URL)}`);
	console.log(`Target DB: ${redactConnectionString(TARGET_DATABASE_URL)}`);
	console.log(`Dry run: ${DRY_RUN ? 'yes' : 'no'}`);

	const sourcePool = new Pool({ connectionString: SOURCE_DATABASE_URL });
	const targetPool = new Pool({ connectionString: TARGET_DATABASE_URL });
	const prisma = new PrismaClient({
		adapter: new PrismaPg(targetPool)
	});

	try {
		const meritRowsResult = await sourcePool.query<OldEventMeritRow>(
			`SELECT id, "userID", "awardedBy", description, "additionalNotes", "typeId", merits, "createdAt", "updatedAt"
			 FROM "arbiter"."merit"
			 WHERE "typeId" = ANY($1::int[])
			 ORDER BY id ASC`,
			[INCLUDED_OLD_EVENT_MERIT_TYPE_IDS]
		);
		const sessionRootRowsResult = await sourcePool.query<OldEventSessionRootRow>(
			`SELECT id, "rootSessionId"
			 FROM "arbiter"."eventSession"`
		);
		const rootSessionIdBySessionId = new Map<number, number>();
		for (const row of sessionRootRowsResult.rows) {
			rootSessionIdBySessionId.set(row.id, row.rootSessionId ?? row.id);
		}

		const systemUser = await prisma.user.upsert({
			where: { discordUserId: ARBITER_SYSTEM_DISCORD_USER_ID },
			update: {
				discordUsername: ARBITER_SYSTEM_USERNAME,
				discordNickname: ARBITER_SYSTEM_NICKNAME,
				discordAvatarUrl: ARBITER_SYSTEM_AVATAR_URL
			},
			create: {
				discordUserId: ARBITER_SYSTEM_DISCORD_USER_ID,
				discordUsername: ARBITER_SYSTEM_USERNAME,
				discordNickname: ARBITER_SYSTEM_NICKNAME,
				discordAvatarUrl: ARBITER_SYSTEM_AVATAR_URL
			},
			select: { id: true, discordUserId: true }
		});

		const mappedMeritTypeCodes = [...new Set(Object.values(OLD_EVENT_MERIT_TYPE_TO_NEW_CODE))];
		const meritTypes = await prisma.meritType.findMany({
			where: {
				code: {
					in: mappedMeritTypeCodes
				}
			},
			select: {
				id: true,
				code: true,
				meritAmount: true
			}
		});
		const meritTypeIdByCode = new Map(meritTypes.map((meritType) => [meritType.code, meritType.id]));
		const meritAmountByCode = new Map(meritTypes.map((meritType) => [meritType.code, meritType.meritAmount]));
		for (const code of mappedMeritTypeCodes) {
			if (!meritTypeIdByCode.has(code) || !meritAmountByCode.has(code)) {
				throw new Error(`Missing MeritType in target DB for code: ${code}`);
			}
		}

		const discordIds = new Set<string>([systemUser.discordUserId]);
		for (const row of meritRowsResult.rows) {
			discordIds.add(row.userID);
			discordIds.add(row.awardedBy);
		}
		const users = await prisma.user.findMany({
			where: {
				discordUserId: {
					in: [...discordIds]
				}
			},
			select: {
				id: true,
				discordUserId: true
			}
		});
		const userIdByDiscordId = new Map(users.map((user) => [user.discordUserId, user.id]));
		userIdByDiscordId.set(systemUser.discordUserId, systemUser.id);

		const existingEventIds = new Set(
			(
				await prisma.event.findMany({
					select: { id: true }
				})
			).map((event) => event.id)
		);

		const stats = {
			totalRowsFetched: meritRowsResult.rows.length,
			rowsMapped: 0,
			rowsSkippedMissingRecipient: 0,
			rowsSkippedUnmappedType: 0,
			rowsSkippedUnmappableMeritValue: 0,
			awarderReplacedWithSystemUser: 0,
			rowsWithSessionRef: 0,
			rowsWithMissingEventRef: 0,
			rowsWithRootSessionRef: 0,
			meritsInserted: 0,
			wouldInsert: 0,
			failed: 0
		};

		const createRows: {
			userId: string;
			awardedByUserId: string;
			meritTypeId: number;
			reason: string;
			eventSessionId: number | null;
			createdAt: Date;
			updatedAt: Date;
		}[] = [];

		for (const row of meritRowsResult.rows) {
			try {
				const recipientUserId = userIdByDiscordId.get(row.userID);
				if (!recipientUserId) {
					stats.rowsSkippedMissingRecipient += 1;
					continue;
				}

				const preferredCode = OLD_EVENT_MERIT_TYPE_TO_NEW_CODE[row.typeId];
				if (!preferredCode) {
					stats.rowsSkippedUnmappedType += 1;
					continue;
				}

				const resolvedCode = resolveMeritTypeCodeForLegacyRow({
					preferredCode,
					oldMerits: row.merits,
					meritAmountByCode
				});
				if (!resolvedCode) {
					stats.rowsSkippedUnmappableMeritValue += 1;
					continue;
				}

				const meritTypeId = meritTypeIdByCode.get(resolvedCode);
				if (!meritTypeId) {
					throw new Error(`Mapped code ${resolvedCode} did not resolve to a MeritType id`);
				}

				const awardedByUserId = userIdByDiscordId.get(row.awardedBy) ?? systemUser.id;
				if (!userIdByDiscordId.has(row.awardedBy)) {
					stats.awarderReplacedWithSystemUser += 1;
				}

				let eventSessionId: number | null = null;
				const parsedSessionId = parseLegacyEventSessionId(row.additionalNotes ?? '');
				if (parsedSessionId !== null) {
					stats.rowsWithSessionRef += 1;
					const mappedRootSessionId = rootSessionIdBySessionId.get(parsedSessionId) ?? parsedSessionId;
					if (mappedRootSessionId !== parsedSessionId) {
						stats.rowsWithRootSessionRef += 1;
					}
					eventSessionId = existingEventIds.has(mappedRootSessionId) ? mappedRootSessionId : null;
					if (eventSessionId === null) {
						stats.rowsWithMissingEventRef += 1;
					}
				}

				createRows.push({
					userId: recipientUserId,
					awardedByUserId,
					meritTypeId,
					reason: buildReason(row.description, row.additionalNotes),
					eventSessionId,
					createdAt: row.createdAt,
					updatedAt: row.updatedAt
				});
				stats.rowsMapped += 1;
			} catch (error) {
				stats.failed += 1;
				console.error(`Failed mapping legacy event merit id ${row.id}`, error);
				if (FAIL_FAST) {
					throw error;
				}
			}
		}

		if (DRY_RUN) {
			stats.wouldInsert = createRows.length;
			console.log('Event merit seeding dry run finished');
			console.table(stats);
			return;
		}

		for (let index = 0; index < createRows.length; index += BATCH_SIZE) {
			const batch = createRows.slice(index, index + BATCH_SIZE);
			const result = await prisma.merit.createMany({
				data: batch
			});
			stats.meritsInserted += result.count;
		}

		console.log('Event merit seeding finished');
		console.table(stats);
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
