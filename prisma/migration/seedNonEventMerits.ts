import { PrismaPg } from '@prisma/adapter-pg';
import { MeritTypeCode, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { redactConnectionString, requiredEnv } from './env';

type OldMeritRow = {
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

const SOURCE_DATABASE_URL = requiredEnv('MIGRATION_SOURCE_DATABASE_URL');
const TARGET_DATABASE_URL = requiredEnv(['MIGRATION_TARGET_DATABASE_URL', 'DATABASE_URL']);

const ARBITER_SYSTEM_DISCORD_USER_ID = '1376748367731884063';
const ARBITER_SYSTEM_USERNAME = 'arbiter-system';
const ARBITER_SYSTEM_NICKNAME = 'Arbiter';
const ARBITER_SYSTEM_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';
const LEGACY_TYPE_7_AWARDER_DISCORD_USER_ID = '243902598757744641';
const LEGACY_TYPE_7_AWARDER_USERNAME = 'legacy-type-7-awarder';
const LEGACY_TYPE_7_AWARDER_NICKNAME = 'Legacy Type 7 Awarder';
const LEGACY_TYPE_7_AWARDER_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';

const DRY_RUN = false;
const FAIL_FAST = true;
const BATCH_SIZE = 1000;

const OLD_CENTURION_HOST_MERIT_TYPE_ID = 4;
const OLD_SPECIAL_COMMANDER_AWARD_TYPE_ID = 7;
const OLD_NON_EVENT_MERIT_TYPE_TO_NEW_CODE: Record<number, MeritTypeCode> = {
	5: MeritTypeCode.COMMANDER_MERIT,
	6: MeritTypeCode.DEMERIT,
	8: MeritTypeCode.TESSERARIUS_MERIT
};
const INCLUDED_OLD_TYPE_IDS = [
	...new Set([
		OLD_CENTURION_HOST_MERIT_TYPE_ID,
		OLD_SPECIAL_COMMANDER_AWARD_TYPE_ID,
		...Object.keys(OLD_NON_EVENT_MERIT_TYPE_TO_NEW_CODE).map(Number)
	])
];

function buildReason(description: string, additionalNotes: string): string {
	const trimmedDescription = description.trim();
	const trimmedAdditionalNotes = additionalNotes.trim();

	if (trimmedDescription.length > 0 && trimmedAdditionalNotes.length > 0) {
		return `${trimmedDescription} | ${trimmedAdditionalNotes}`;
	}
	if (trimmedDescription.length > 0) {
		return trimmedDescription;
	}
	if (trimmedAdditionalNotes.length > 0) {
		return trimmedAdditionalNotes;
	}

	return 'Migrated legacy merit';
}

function resolveInsertCountForLegacyMeritValue({
	legacyMeritValue,
	mappedMeritAmount
}: {
	legacyMeritValue: number;
	mappedMeritAmount: number;
}): number | null {
	if (legacyMeritValue === 0 || mappedMeritAmount === 0) {
		return legacyMeritValue === mappedMeritAmount ? 1 : null;
	}

	if (legacyMeritValue === mappedMeritAmount) {
		return 1;
	}

	// Exact decomposition when values are aligned (for example: -2 with -1 amount).
	if (legacyMeritValue % mappedMeritAmount === 0) {
		const ratio = legacyMeritValue / mappedMeritAmount;
		if (Number.isInteger(ratio) && ratio > 0) {
			return ratio;
		}
	}

	// Preserve positive commander-style bundles by splitting into +1 rows.
	if (mappedMeritAmount === 1 && legacyMeritValue > 0) {
		return legacyMeritValue;
	}

	// Preserve stacked demerits by splitting into -1 rows.
	if (mappedMeritAmount === -1 && legacyMeritValue < 0) {
		return Math.abs(legacyMeritValue);
	}

	return null;
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
		const meritRowsResult = await sourcePool.query<OldMeritRow>(
			`SELECT id, "userID", "awardedBy", description, "additionalNotes", "typeId", merits, "createdAt", "updatedAt"
			 FROM "arbiter"."merit"
			 WHERE "typeId" = ANY($1::int[])
			 ORDER BY id ASC`,
			[INCLUDED_OLD_TYPE_IDS]
		);

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
		const legacyType7AwarderUser = await prisma.user.upsert({
			where: { discordUserId: LEGACY_TYPE_7_AWARDER_DISCORD_USER_ID },
			update: {},
			create: {
				discordUserId: LEGACY_TYPE_7_AWARDER_DISCORD_USER_ID,
				discordUsername: LEGACY_TYPE_7_AWARDER_USERNAME,
				discordNickname: LEGACY_TYPE_7_AWARDER_NICKNAME,
				discordAvatarUrl: LEGACY_TYPE_7_AWARDER_AVATAR_URL
			},
			select: { id: true, discordUserId: true }
		});

		const mappedMeritTypeCodes = [...new Set([MeritTypeCode.CENTURION_HOST_MERIT, ...Object.values(OLD_NON_EVENT_MERIT_TYPE_TO_NEW_CODE)])];
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
			if (!meritTypeIdByCode.has(code)) {
				throw new Error(`Missing MeritType in target DB for code: ${code}`);
			}
			if (!meritAmountByCode.has(code)) {
				throw new Error(`Missing MeritType meritAmount in target DB for code: ${code}`);
			}
		}

		const discordIds = new Set<string>([systemUser.discordUserId]);
		for (const row of meritRowsResult.rows) {
			discordIds.add(row.userID);
			discordIds.add(row.awardedBy);
		}
		discordIds.add(legacyType7AwarderUser.discordUserId);

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
		userIdByDiscordId.set(legacyType7AwarderUser.discordUserId, legacyType7AwarderUser.id);

		const stats = {
			totalRowsFetched: meritRowsResult.rows.length,
			rowsMapped: 0,
			rowsExpandedForLegacyValue: 0,
			rowsRoundedUpForCenturionHostMerit: 0,
			type7RowsEncountered: 0,
			type7UniqueRecipients: 0,
			type7RecipientsMissingInTarget: 0,
			type7CommanderMeritsAdded: 0,
			rowsUnmappedType: 0,
			rowsSkippedUnmappableMeritValue: 0,
			rowsSkippedMissingRecipient: 0,
			awarderReplacedWithSystemUser: 0,
			meritsInserted: 0,
			wouldInsert: 0,
			failed: 0
		};

		const createRows: {
			userId: string;
			awardedByUserId: string;
			meritTypeId: number;
			reason: string;
			eventSessionId: null;
			createdAt: Date;
			updatedAt: Date;
		}[] = [];
		const type7AwardSeedByRecipientDiscordId = new Map<
			string,
			{
				createdAt: Date;
				updatedAt: Date;
			}
		>();
		const commanderMeritTypeId = meritTypeIdByCode.get(MeritTypeCode.COMMANDER_MERIT);
		if (!commanderMeritTypeId) {
			throw new Error('Mapped code COMMANDER_MERIT did not resolve to a MeritType id');
		}

		for (const row of meritRowsResult.rows) {
			try {
				if (row.typeId === OLD_SPECIAL_COMMANDER_AWARD_TYPE_ID) {
					stats.type7RowsEncountered += 1;
					if (!type7AwardSeedByRecipientDiscordId.has(row.userID)) {
						type7AwardSeedByRecipientDiscordId.set(row.userID, {
							createdAt: row.createdAt,
							updatedAt: row.updatedAt
						});
					}
					continue;
				}

				let mappedCode: MeritTypeCode;
				let insertCount: number | null = null;
				if (row.typeId === OLD_CENTURION_HOST_MERIT_TYPE_ID) {
					if (row.merits === 1) {
						mappedCode = MeritTypeCode.COMMANDER_MERIT;
						insertCount = 1;
					} else if (row.merits > 0) {
						mappedCode = MeritTypeCode.CENTURION_HOST_MERIT;
						insertCount = Math.ceil(row.merits / 2);
						if (row.merits % 2 !== 0) {
							stats.rowsRoundedUpForCenturionHostMerit += 1;
						}
					} else {
						stats.rowsSkippedUnmappableMeritValue += 1;
						continue;
					}
				} else {
					const defaultMappedCode = OLD_NON_EVENT_MERIT_TYPE_TO_NEW_CODE[row.typeId];
					if (!defaultMappedCode) {
						stats.rowsUnmappedType += 1;
						continue;
					}
					mappedCode = defaultMappedCode;

					const meritAmount = meritAmountByCode.get(mappedCode);
					if (meritAmount === undefined) {
						throw new Error(`Mapped code ${mappedCode} did not resolve to a MeritType meritAmount`);
					}
					insertCount = resolveInsertCountForLegacyMeritValue({
						legacyMeritValue: row.merits,
						mappedMeritAmount: meritAmount
					});
				}

				const meritTypeId = meritTypeIdByCode.get(mappedCode);
				if (!meritTypeId) {
					throw new Error(`Mapped code ${mappedCode} did not resolve to a MeritType id`);
				}

				const recipientUserId = userIdByDiscordId.get(row.userID);
				if (!recipientUserId) {
					stats.rowsSkippedMissingRecipient += 1;
					continue;
				}

				const awardedByUserId = userIdByDiscordId.get(row.awardedBy) ?? systemUser.id;
				if (!userIdByDiscordId.has(row.awardedBy)) {
					stats.awarderReplacedWithSystemUser += 1;
				}

				if (!insertCount || insertCount < 1) {
					stats.rowsSkippedUnmappableMeritValue += 1;
					continue;
				}
				if (insertCount > 1) {
					stats.rowsExpandedForLegacyValue += 1;
				}

				for (let i = 0; i < insertCount; i += 1) {
					createRows.push({
						userId: recipientUserId,
						awardedByUserId,
						meritTypeId,
						reason: buildReason(row.description, row.additionalNotes),
						eventSessionId: null,
						createdAt: row.createdAt,
						updatedAt: row.updatedAt
					});
				}
				stats.rowsMapped += 1;
			} catch (error) {
				stats.failed += 1;
				console.error(`Failed mapping legacy merit id ${row.id}`, error);
				if (FAIL_FAST) {
					throw error;
				}
			}
		}
		stats.type7UniqueRecipients = type7AwardSeedByRecipientDiscordId.size;
		for (const [recipientDiscordId, timestamps] of type7AwardSeedByRecipientDiscordId) {
			const recipientUserId = userIdByDiscordId.get(recipientDiscordId);
			if (!recipientUserId) {
				stats.type7RecipientsMissingInTarget += 1;
				continue;
			}

			createRows.push({
				userId: recipientUserId,
				awardedByUserId: legacyType7AwarderUser.id,
				meritTypeId: commanderMeritTypeId,
				reason: 'Migrated legacy typeId=7 merit',
				eventSessionId: null,
				createdAt: timestamps.createdAt,
				updatedAt: timestamps.updatedAt
			});
			stats.type7CommanderMeritsAdded += 1;
		}

		if (DRY_RUN) {
			stats.wouldInsert = createRows.length;
			console.log('Non-event merit seeding dry run finished');
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

		console.log('Non-event merit seeding finished');
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
