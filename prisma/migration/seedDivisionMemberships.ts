import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { DivisionKind, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

type DivisionSeedUser = {
	userId: string;
	discordUserId: string;
	parsedDivisionPrefixes: string[];
};

type SeedDivisionMembershipsParams = {
	prisma: PrismaClient;
	users: DivisionSeedUser[];
	dryRun: boolean;
	sourceDatabaseUrl: string;
};

type SeedDivisionMembershipsStats = {
	totalUsers: number;
	auxOnlyUsers: number;
	staffUsers: number;
	lgnFallbackUsers: number;
	usersWithUnknownPrefixes: number;
	targetMembershipRows: number;
};

const AUX_PREFIX = 'AUX';
const ANG_DIVISION_CODE = 'ANG';
const AMB_DIVISION_CODE = 'AMB';
const INT_DIVISION_CODE = 'INT';
const RES_DIVISION_CODE = 'RES';
const CMD_DIVISION_CODE = 'CMD';
const PRA_DIVISION_CODE = 'PRA';
const LGN_DIVISION_CODE = 'LGN';
const NVY_L_DIVISION_CODE = 'NVY-L';
const MRN_L_DIVISION_CODE = 'MRN-L';
const HL_L_PREFIX = 'HL-L';
const HV_L_PREFIX = 'HV-L';
const QRM_PREFIX = 'QRM';
const CMD_STAR_PREFIXES = new Set<string>(['CMD ★', 'CMD★']);
const LEGACY_LGN_PREFIXES = new Set<string>(['RFT', 'SPR', 'TRA', 'HLO ◇', 'HLO◇']);
const PREFIX_REPORT_OUTPUT_PATH = 'data/division-prefix-membership-report.json';
const LEGACY_DIVISION_CODE_QUERY_CANDIDATES = [
	'SELECT code FROM "arbiter"."division"',
	'SELECT code FROM arbiter.division',
	'SELECT code FROM arbiter."division"',
	'SELECT code FROM "arbiter"."Division"',
	'SELECT code FROM arbiter."Division"',
	'SELECT code FROM "Division"',
	'SELECT code FROM "Divisions"',
	'SELECT code FROM division',
	'SELECT code FROM divisions'
];

type PrefixSummary = {
	userCount: number;
	membershipCounts: Map<string, number>;
	discordUserIds: Set<string>;
};

type UnknownPrefixUser = {
	discordUserId: string;
	parsedPrefixes: string[];
	unrecognizedPrefixes: string[];
};

type NonOrgPrefixSummary = {
	userCount: number;
	discordUserIds: Set<string>;
};

function normalizePrefixes(prefixes: string[]): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];

	for (const raw of prefixes) {
		const value = raw.replace(/\s+/g, ' ').trim().toUpperCase();
		if (value.length === 0 || seen.has(value)) {
			continue;
		}
		seen.add(value);
		normalized.push(value);
	}

	return normalized;
}

function isRecognizedOrgPrefix(prefix: string, recognizedDivisionCodes: Set<string>): boolean {
	if (recognizedDivisionCodes.has(prefix)) {
		return true;
	}
	if (prefix === AUX_PREFIX) {
		// Legacy AUX prefix was replaced by RES but still appears in old nicknames.
		return true;
	}
	if (LEGACY_LGN_PREFIXES.has(prefix)) {
		// Legacy divisions that are no longer active should map to LGN membership.
		return true;
	}
	if (prefix === HL_L_PREFIX || prefix === HV_L_PREFIX) {
		// Legacy lancearius aliases retained in nicknames.
		return true;
	}

	return prefix.includes('CMD');
}

async function fetchLegacyDivisionCodes(sourceDatabaseUrl: string): Promise<Set<string>> {
	const sourcePool = new Pool({ connectionString: sourceDatabaseUrl });

	try {
		// Prefer metadata discovery because legacy DBs can differ in schema/casing.
		const discoveredRelations = await sourcePool.query<{ table_schema: string; table_name: string }>(
			`
				SELECT table_schema, table_name
				FROM information_schema.columns
				WHERE lower(column_name) = 'code'
				  AND lower(table_name) IN ('division', 'divisions')
				  AND table_schema NOT IN ('pg_catalog', 'information_schema')
				ORDER BY
					CASE WHEN table_schema = 'arbiter' THEN 0 ELSE 1 END,
					table_schema,
					table_name
			`
		);

		for (const relation of discoveredRelations.rows) {
			const tableSchema = relation.table_schema.replaceAll('"', '""');
			const tableName = relation.table_name.replaceAll('"', '""');
			const queryText = `SELECT code FROM "${tableSchema}"."${tableName}"`;
			try {
				const result = await sourcePool.query<{ code: string | null }>(queryText);
				return new Set(result.rows.map((row) => row.code?.trim().toUpperCase() ?? '').filter((value) => value.length > 0));
			} catch {
				// Continue to static fallback queries below.
			}
		}

		let lastError: unknown;
		for (const queryText of LEGACY_DIVISION_CODE_QUERY_CANDIDATES) {
			try {
				const result = await sourcePool.query<{ code: string | null }>(queryText);
				return new Set(result.rows.map((row) => row.code?.trim().toUpperCase() ?? '').filter((value) => value.length > 0));
			} catch (error) {
				lastError = error;
			}
		}

		const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
		throw new Error(`Unable to read legacy division codes from source DB: ${lastErrorMessage}`);
	} finally {
		await sourcePool.end();
	}
}

async function writePrefixReport({
	prefixSummaries,
	nonOrgPrefixSummaries,
	totalUsers,
	unknownPrefixUsers
}: {
	prefixSummaries: Map<string, PrefixSummary>;
	nonOrgPrefixSummaries: Map<string, NonOrgPrefixSummary>;
	totalUsers: number;
	unknownPrefixUsers: UnknownPrefixUser[];
}): Promise<void> {
	const orgEntries = [...prefixSummaries.entries()]
		.sort((left, right) => left[0].localeCompare(right[0]))
		.map(([prefix, summary]) => ({
			prefix,
			userCount: summary.userCount,
			...(summary.userCount < 10 ? { discordUserIds: [...summary.discordUserIds].sort((left, right) => left.localeCompare(right)) } : {}),
			memberships: [...summary.membershipCounts.entries()]
				.sort((left, right) => left[0].localeCompare(right[0]))
				.map(([membershipCode, count]) => ({
					membershipCode,
					count
				}))
		}));
	const nonOrgEntries = [...nonOrgPrefixSummaries.entries()]
		.sort((left, right) => left[0].localeCompare(right[0]))
		.map(([prefix, summary]) => ({
			prefix,
			userCount: summary.userCount,
			...(summary.userCount < 10 ? { discordUserIds: [...summary.discordUserIds].sort((left, right) => left.localeCompare(right)) } : {})
		}));

	const payload = {
		generatedAt: new Date().toISOString(),
		totalUsers,
		prefixCount: orgEntries.length,
		nonOrgPrefixCount: nonOrgEntries.length,
		orgUserCount: totalUsers - unknownPrefixUsers.length,
		nonOrgUserCount: unknownPrefixUsers.length,
		usersWithUnknownPrefixes: unknownPrefixUsers,
		prefixes: orgEntries,
		nonOrgPrefixes: nonOrgEntries
	};

	await mkdir(dirname(PREFIX_REPORT_OUTPUT_PATH), { recursive: true });
	await writeFile(PREFIX_REPORT_OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function seedDivisionMemberships({
	prisma,
	users,
	dryRun,
	sourceDatabaseUrl
}: SeedDivisionMembershipsParams): Promise<SeedDivisionMembershipsStats> {
	if (users.length === 0) {
		return {
			totalUsers: 0,
			auxOnlyUsers: 0,
			staffUsers: 0,
			lgnFallbackUsers: 0,
			usersWithUnknownPrefixes: 0,
			targetMembershipRows: 0
		};
	}

	const divisions = await prisma.division.findMany({
		select: {
			id: true,
			code: true,
			kind: true
		}
	});
	const divisionIdByCode = new Map(divisions.map((division) => [division.code.toUpperCase(), division.id]));
	const staffDivisionIdByCode = new Map(
		divisions.filter((division) => division.kind === DivisionKind.STAFF).map((division) => [division.code.toUpperCase(), division.id])
	);
	const legacyDivisionCodes = await fetchLegacyDivisionCodes(sourceDatabaseUrl);
	const recognizedDivisionCodes = new Set<string>([...divisionIdByCode.keys(), ...legacyDivisionCodes]);

	const intDivisionId = divisionIdByCode.get(INT_DIVISION_CODE);
	const angDivisionId = divisionIdByCode.get(ANG_DIVISION_CODE);
	const cmdDivisionId = divisionIdByCode.get(CMD_DIVISION_CODE);
	const lgnDivisionId = divisionIdByCode.get(LGN_DIVISION_CODE);
	if (!intDivisionId || !angDivisionId || !cmdDivisionId || !lgnDivisionId) {
		throw new Error(`Missing required divisions: ${INT_DIVISION_CODE}, ${ANG_DIVISION_CODE}, ${CMD_DIVISION_CODE}, and/or ${LGN_DIVISION_CODE}`);
	}

	const byUserId = new Map<string, DivisionSeedUser>();
	for (const user of users) {
		byUserId.set(user.userId, user);
	}

	const targetRows: { userId: string; divisionId: number }[] = [];
	const prefixSummaries = new Map<string, PrefixSummary>();
	const nonOrgPrefixSummaries = new Map<string, NonOrgPrefixSummary>();
	const unknownPrefixUsers: UnknownPrefixUser[] = [];
	const stats: SeedDivisionMembershipsStats = {
		totalUsers: byUserId.size,
		auxOnlyUsers: 0,
		staffUsers: 0,
		lgnFallbackUsers: 0,
		usersWithUnknownPrefixes: 0,
		targetMembershipRows: 0
	};

	for (const user of byUserId.values()) {
		const prefixes = normalizePrefixes(user.parsedDivisionPrefixes);
		const recognizedPrefixes = prefixes.filter((prefix) => isRecognizedOrgPrefix(prefix, recognizedDivisionCodes));
		const unrecognizedPrefixes = prefixes.filter((prefix) => !isRecognizedOrgPrefix(prefix, recognizedDivisionCodes));
		if (recognizedPrefixes.length === 0) {
			if (unrecognizedPrefixes.length > 0) {
				stats.usersWithUnknownPrefixes += 1;
				unknownPrefixUsers.push({
					discordUserId: user.discordUserId,
					parsedPrefixes: prefixes,
					unrecognizedPrefixes
				});

				for (const prefix of unrecognizedPrefixes) {
					const current = nonOrgPrefixSummaries.get(prefix) ?? {
						userCount: 0,
						discordUserIds: new Set<string>()
					};
					current.userCount += 1;
					current.discordUserIds.add(user.discordUserId);
					nonOrgPrefixSummaries.set(prefix, current);
				}
			}
			continue;
		}

		const assignedMembershipCodeSet = new Set<string>();
		const matchedStaffMembershipCodes = recognizedPrefixes.filter((prefix) => staffDivisionIdByCode.has(prefix));
		const hasAngPrefix = recognizedPrefixes.includes(ANG_DIVISION_CODE);
		const hasLgnPrefix = recognizedPrefixes.includes(LGN_DIVISION_CODE);
		const isAuxOnly = prefixes.length === 1 && prefixes[0] === AUX_PREFIX;
		const hasCmdContainingPrefix = recognizedPrefixes.some((prefix) => prefix.includes('CMD'));

		if (isAuxOnly) {
			stats.auxOnlyUsers += 1;
			assignedMembershipCodeSet.add(RES_DIVISION_CODE);
		}

		if (recognizedPrefixes.includes(INT_DIVISION_CODE)) {
			assignedMembershipCodeSet.add(INT_DIVISION_CODE);
		}
		if (recognizedPrefixes.includes(RES_DIVISION_CODE) && !hasLgnPrefix) {
			assignedMembershipCodeSet.add(RES_DIVISION_CODE);
		}
		if (recognizedPrefixes.includes(AMB_DIVISION_CODE)) {
			assignedMembershipCodeSet.add(AMB_DIVISION_CODE);
		}
		if (hasAngPrefix) {
			assignedMembershipCodeSet.add(ANG_DIVISION_CODE);
			assignedMembershipCodeSet.add(LGN_DIVISION_CODE);
		}
		if (recognizedPrefixes.some((prefix) => CMD_STAR_PREFIXES.has(prefix))) {
			assignedMembershipCodeSet.add(PRA_DIVISION_CODE);
		}
		if (recognizedPrefixes.includes(QRM_PREFIX)) {
			assignedMembershipCodeSet.add(CMD_DIVISION_CODE);
		}
		if (recognizedPrefixes.some((prefix) => prefix.includes('CMD') && !CMD_STAR_PREFIXES.has(prefix))) {
			assignedMembershipCodeSet.add(CMD_DIVISION_CODE);
		}
		if (hasCmdContainingPrefix) {
			assignedMembershipCodeSet.add(LGN_DIVISION_CODE);
		}
		if (recognizedPrefixes.includes(HL_L_PREFIX)) {
			assignedMembershipCodeSet.add(LGN_DIVISION_CODE);
			assignedMembershipCodeSet.add(NVY_L_DIVISION_CODE);
		}
		if (recognizedPrefixes.includes(HV_L_PREFIX)) {
			assignedMembershipCodeSet.add(LGN_DIVISION_CODE);
			assignedMembershipCodeSet.add(MRN_L_DIVISION_CODE);
		}
		if (matchedStaffMembershipCodes.length > 0) {
			stats.staffUsers += 1;
			assignedMembershipCodeSet.add(LGN_DIVISION_CODE);
			for (const staffCode of matchedStaffMembershipCodes) {
				assignedMembershipCodeSet.add(staffCode);
			}
		}

		if (assignedMembershipCodeSet.size === 0) {
			stats.lgnFallbackUsers += 1;
			assignedMembershipCodeSet.add(LGN_DIVISION_CODE);
		}

		const assignedMembershipCodes = [...assignedMembershipCodeSet];
		for (const membershipCode of assignedMembershipCodes) {
			const divisionId =
				membershipCode === INT_DIVISION_CODE
					? intDivisionId
					: membershipCode === ANG_DIVISION_CODE
						? angDivisionId
						: membershipCode === CMD_DIVISION_CODE
							? cmdDivisionId
							: divisionIdByCode.get(membershipCode);

			if (!divisionId) {
				throw new Error(`Division code ${membershipCode} was resolved from prefixes but does not exist in Division table`);
			}
			targetRows.push({
				userId: user.userId,
				divisionId
			});
		}

		if (recognizedPrefixes.length > 0) {
			for (const prefix of recognizedPrefixes) {
				const current = prefixSummaries.get(prefix) ?? {
					userCount: 0,
					membershipCounts: new Map<string, number>(),
					discordUserIds: new Set<string>()
				};
				current.userCount += 1;
				current.discordUserIds.add(user.discordUserId);
				for (const assignedMembershipCode of assignedMembershipCodes) {
					current.membershipCounts.set(assignedMembershipCode, (current.membershipCounts.get(assignedMembershipCode) ?? 0) + 1);
				}
				prefixSummaries.set(prefix, current);
			}
		}
	}

	stats.targetMembershipRows = targetRows.length;
	await writePrefixReport({
		prefixSummaries,
		nonOrgPrefixSummaries,
		totalUsers: stats.totalUsers,
		unknownPrefixUsers
	});

	if (dryRun) {
		return stats;
	}

	const userIds = [...byUserId.keys()];
	await prisma.$transaction(async (tx) => {
		await tx.divisionMembership.deleteMany({
			where: {
				userId: {
					in: userIds
				}
			}
		});

		if (targetRows.length > 0) {
			await tx.divisionMembership.createMany({
				data: targetRows
			});
		}
	});

	return stats;
}
