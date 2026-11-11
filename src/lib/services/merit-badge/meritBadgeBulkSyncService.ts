import type { MeritBadgeRoleMap } from '../../../config/meritBadgeRoles';
import type { ContextLogger } from '../../logging/executionContext';
import { MERIT_BADGE_TIERS, type MeritBadgeTier } from '../merit-rank/meritBadge';
import { getMeritRankSymbol, resolveMeritRankLevel } from '../merit-rank/meritRank';
import { isMeritBadgeRolePlanNoOp, planMeritBadgeRoles, type MeritBadgeRolePlan } from './meritBadgeRolePlan';
import type { MeritBadgeSyncResult } from './meritBadgeSyncService';

/**
 * Server-wide badge reconcile for `/staff merit_badges sync` (MB-06).
 *
 * The dry run builds the cutover report and makes no writes. The live run applies badges one
 * member at a time through the single-member sync service, paced, time-boxed and stopped early on
 * repeated long rate-limit waits. There is no checkpoint: a rerun starts from the top and members
 * who already hold the right badge cost zero Discord calls.
 */

/** Members whose totals are read in one Postgres round trip. */
export const MERIT_BADGE_BULK_TOTALS_CHUNK_SIZE = 100;
/** Stops a live run in time to edit the interaction reply, which expires after 15 minutes. */
export const MERIT_BADGE_BULK_DEADLINE_MS = 12 * 60_000;
/**
 * Pause after each member whose sync made role calls. The one pacing constant: set conservatively for
 * the first production run, then tuned on the test server. discord.js still queues any rate limit.
 */
export const MERIT_BADGE_BULK_PACE_MS = 1_000;
/** A rate-limit wait at least this long counts toward stopping the run. */
export const MERIT_BADGE_BULK_LONG_RATE_LIMIT_WAIT_MS = 10_000;
/** The run stops, between members, after this many long rate-limit waits. */
export const MERIT_BADGE_BULK_MAX_LONG_RATE_LIMIT_WAITS = 3;

export type MeritBadgeBulkMember = Readonly<{
	discordUserId: string;
	isBot: boolean;
	roleIds: readonly string[];
}>;

export type MeritBadgeStoredTotal = Readonly<{
	totalMerits: number;
	storedUsername: string;
}>;

/**
 * Reads totals for one chunk of members. A member missing from the map has no User row (0 merits).
 * Must throw when the read fails; a failed read is never an empty map.
 */
export type ReadMeritBadgeTotals = (discordUserIds: readonly string[]) => Promise<ReadonlyMap<string, MeritBadgeStoredTotal>>;

export type MeritBadgePlannedAction = 'add' | 'swap' | 'remove' | 'none' | 'unconfigured';

export const MERIT_BADGE_PLANNED_ACTIONS: readonly MeritBadgePlannedAction[] = Object.freeze(['add', 'swap', 'remove', 'none', 'unconfigured']);

export type MeritBadgeReportRow = Readonly<{
	discordUserId: string;
	/** The stored Discord username from the User row, or null when the member has no User row. */
	storedUsername: string | null;
	totalMerits: number;
	legacyLevel: number | null;
	legacySymbol: string | null;
	desiredTier: MeritBadgeTier | null;
	/** True when the desired tier's own role ID is configured. */
	desiredRoleConfigured: boolean;
	/** Configured badge roles the member holds now, in ladder order. */
	currentTiers: readonly MeritBadgeTier[];
	action: MeritBadgePlannedAction;
}>;

export type MeritBadgeTierCount = Readonly<{ tier: MeritBadgeTier; count: number }>;

export type MeritBadgeCutoverReport =
	| { kind: 'no_members' }
	| { kind: 'read_failed' }
	| {
			kind: 'report';
			rows: readonly MeritBadgeReportRow[];
			/** Desired tiers with at least one member, in ladder order. */
			histogram: readonly MeritBadgeTierCount[];
			noBadgeCount: number;
			actionCounts: Readonly<Record<MeritBadgePlannedAction, number>>;
	  };

export type MeritBadgeBulkReportDeps = {
	roleMap: MeritBadgeRoleMap;
	/** Lists guild members: only the requested one when given (empty when not in the guild). */
	listMembers: (params: { requestedDiscordUserId?: string }) => Promise<readonly MeritBadgeBulkMember[]>;
	readTotals: ReadMeritBadgeTotals;
	chunkSize?: number;
};

/**
 * Builds the cutover report. Reads only: no role calls and no database writes. Works with no
 * badge role configured. Any totals read failure fails the whole report instead of showing a
 * partial or zeroed one.
 */
export async function buildMeritBadgeCutoverReport(
	deps: MeritBadgeBulkReportDeps,
	{ requestedDiscordUserId }: { requestedDiscordUserId?: string } = {}
): Promise<MeritBadgeCutoverReport> {
	const members = toSortedHumanMembers(await deps.listMembers({ requestedDiscordUserId }));
	if (members.length === 0) {
		return { kind: 'no_members' };
	}

	const rows: MeritBadgeReportRow[] = [];
	for (const chunk of toChunks(members, deps.chunkSize ?? MERIT_BADGE_BULK_TOTALS_CHUNK_SIZE)) {
		let totals: ReadonlyMap<string, MeritBadgeStoredTotal>;
		try {
			totals = await deps.readTotals(chunk.map((member) => member.discordUserId));
		} catch {
			return { kind: 'read_failed' };
		}

		for (const member of chunk) {
			const stored = totals.get(member.discordUserId);
			const totalMerits = stored?.totalMerits ?? 0;
			if (!Number.isFinite(totalMerits)) {
				return { kind: 'read_failed' };
			}
			rows.push(buildReportRow({ member, storedUsername: stored?.storedUsername ?? null, totalMerits, roleMap: deps.roleMap }));
		}
	}

	const countsByTier = new Map<number, number>();
	const actionCounts: Record<MeritBadgePlannedAction, number> = { add: 0, swap: 0, remove: 0, none: 0, unconfigured: 0 };
	let noBadgeCount = 0;
	for (const row of rows) {
		actionCounts[row.action]++;
		if (row.desiredTier) {
			countsByTier.set(row.desiredTier.tier, (countsByTier.get(row.desiredTier.tier) ?? 0) + 1);
		} else {
			noBadgeCount++;
		}
	}

	return {
		kind: 'report',
		rows,
		histogram: MERIT_BADGE_TIERS.flatMap((tier) => {
			const count = countsByTier.get(tier.tier) ?? 0;
			return count > 0 ? [{ tier, count }] : [];
		}),
		noBadgeCount,
		actionCounts
	};
}

function buildReportRow({
	member,
	storedUsername,
	totalMerits,
	roleMap
}: {
	member: MeritBadgeBulkMember;
	storedUsername: string | null;
	totalMerits: number;
	roleMap: MeritBadgeRoleMap;
}): MeritBadgeReportRow {
	const plan = planMeritBadgeRoles({ totalMerits, currentRoleIds: member.roleIds, roleMap });
	const legacyLevel = resolveMeritRankLevel(totalMerits);
	const currentTiers = [...new Set(member.roleIds)]
		.flatMap((roleId) => {
			const tier = roleMap.byRoleId(roleId);
			return tier ? [tier] : [];
		})
		.sort((left, right) => left.tier - right.tier);

	return {
		discordUserId: member.discordUserId,
		storedUsername,
		totalMerits,
		legacyLevel,
		legacySymbol: legacyLevel === null ? null : getMeritRankSymbol(legacyLevel),
		desiredTier: plan.desiredTier,
		desiredRoleConfigured: plan.desiredTier !== null && roleMap.byTier(plan.desiredTier.tier) !== null,
		currentTiers,
		action: toPlannedAction(plan)
	};
}

export function toPlannedAction(plan: MeritBadgeRolePlan): MeritBadgePlannedAction {
	if (plan.roleIdToAdd) {
		return plan.roleIdsToRemove.length > 0 ? 'swap' : 'add';
	}
	if (plan.roleIdsToRemove.length > 0) {
		return 'remove';
	}
	// Nothing to change, but the member earns a tier whose role is not configured yet.
	return plan.tierRoleMissing ? 'unconfigured' : 'none';
}

export type MeritBadgeLiveRunReadiness =
	| { ok: true }
	| { ok: false; reason: 'not_configured' }
	| { ok: false; reason: 'missing_manage_roles' }
	| { ok: false; reason: 'roles_not_editable'; tierLabels: string[] };

/**
 * Prepare checks before any live role call: role IDs configured, Arbiter has Manage Roles, and
 * Arbiter can assign every configured badge role (it exists, is not managed, and sits below
 * Arbiter's highest role).
 */
export function checkMeritBadgeLiveRunReadiness({
	roleMap,
	botHasManageRoles,
	editableRoleIds
}: {
	roleMap: MeritBadgeRoleMap;
	botHasManageRoles: boolean;
	editableRoleIds: ReadonlySet<string>;
}): MeritBadgeLiveRunReadiness {
	if (!roleMap.isEnabled) {
		return { ok: false, reason: 'not_configured' };
	}
	if (!botHasManageRoles) {
		return { ok: false, reason: 'missing_manage_roles' };
	}

	const notEditable = roleMap.configuredRoles.filter(({ roleId }) => !editableRoleIds.has(roleId));
	if (notEditable.length > 0) {
		return { ok: false, reason: 'roles_not_editable', tierLabels: notEditable.map(({ tier }) => tier.label) };
	}

	return { ok: true };
}

export type MeritBadgeBulkStopReason = 'deadline' | 'rate_limited';

export type MeritBadgeBulkSyncResult =
	| { kind: 'no_members' }
	| {
			kind: 'completed' | 'partial';
			/** Why a partial run stopped; null when it completed. */
			stopReason: MeritBadgeBulkStopReason | null;
			targetCount: number;
			processed: number;
			remaining: number;
			updated: number;
			unchanged: number;
			memberLeft: number;
			failed: number;
			/** Members counted as failed because their chunk's totals read failed. Included in `failed`. */
			readFailed: number;
			rateLimitWaits: number;
			longRateLimitWaits: number;
	  };

export type MeritBadgeBulkSyncDeps = MeritBadgeBulkReportDeps & {
	/** Syncs one member through `syncMemberMeritBadge` with the shared lock, re-reading the total inside it. */
	syncMember: (discordUserId: string) => Promise<MeritBadgeSyncResult>;
	/** Subscribes to discord.js REST rate-limit waits; returns an unsubscribe function. */
	watchRateLimits: (onWait: (waitMs: number) => void) => () => void;
	logger: ContextLogger;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
	deadlineMs?: number;
	paceMs?: number;
	longRateLimitWaitMs?: number;
	maxLongRateLimitWaits?: number;
};

/**
 * Applies badges to every non-bot member (or one requested member), in member ID order.
 *
 * - Totals are read in chunks. When a chunk read fails, every member in it counts as failed and
 *   gets no role calls; a failed read is never treated as 0.
 * - A member whose chunk plan is a no-op is counted unchanged with zero calls. Any other member goes
 *   through the single-member sync, which takes the shared lock and re-reads the total inside it,
 *   so a merit awarded during the run is never undone by an older chunk total.
 * - One member at a time, pausing after each member whose sync made role calls.
 * - The deadline and the rate-limit threshold are checked only between members, never inside one
 *   member's add/remove pair. A stopped run reports processed and remaining counts.
 */
export async function runMeritBadgeBulkSync(
	deps: MeritBadgeBulkSyncDeps,
	{ requestedDiscordUserId }: { requestedDiscordUserId?: string } = {}
): Promise<MeritBadgeBulkSyncResult> {
	const now = deps.now ?? Date.now;
	const sleep = deps.sleep ?? defaultSleep;
	const deadlineMs = deps.deadlineMs ?? MERIT_BADGE_BULK_DEADLINE_MS;
	const paceMs = deps.paceMs ?? MERIT_BADGE_BULK_PACE_MS;
	const longWaitMs = deps.longRateLimitWaitMs ?? MERIT_BADGE_BULK_LONG_RATE_LIMIT_WAIT_MS;
	const maxLongWaits = deps.maxLongRateLimitWaits ?? MERIT_BADGE_BULK_MAX_LONG_RATE_LIMIT_WAITS;
	const chunkSize = deps.chunkSize ?? MERIT_BADGE_BULK_TOTALS_CHUNK_SIZE;

	const startedAt = now();
	const members = toSortedHumanMembers(await deps.listMembers({ requestedDiscordUserId }));
	if (members.length === 0) {
		return { kind: 'no_members' };
	}

	const counts = { processed: 0, updated: 0, unchanged: 0, memberLeft: 0, failed: 0, readFailed: 0, rateLimitWaits: 0, longRateLimitWaits: 0 };
	const unsubscribe = deps.watchRateLimits((waitMs) => {
		counts.rateLimitWaits++;
		const isLong = waitMs >= longWaitMs;
		if (isLong) {
			counts.longRateLimitWaits++;
		}
		safeLog(() =>
			deps.logger.warn(
				{ waitMs, isLong, rateLimitWaits: counts.rateLimitWaits, longRateLimitWaits: counts.longRateLimitWaits },
				'merit_badge.bulk_sync.rate_limited'
			)
		);
	});

	let stopReason: MeritBadgeBulkStopReason | null = null;
	let totals: ReadonlyMap<string, MeritBadgeStoredTotal> | null = null;
	try {
		for (let index = 0; index < members.length; index++) {
			if (counts.longRateLimitWaits >= maxLongWaits) {
				stopReason = 'rate_limited';
				break;
			}
			if (now() - startedAt >= deadlineMs) {
				stopReason = 'deadline';
				break;
			}

			if (index % chunkSize === 0) {
				totals = await readChunkTotals(deps.readTotals, members.slice(index, index + chunkSize));
			}

			const member = members[index];
			counts.processed++;
			if (!totals) {
				counts.failed++;
				counts.readFailed++;
				continue;
			}

			// Only a successful read may treat a member with no User row as 0.
			const chunkTotal = totals.get(member.discordUserId)?.totalMerits ?? 0;
			if (
				Number.isFinite(chunkTotal) &&
				isMeritBadgeRolePlanNoOp(planMeritBadgeRoles({ totalMerits: chunkTotal, currentRoleIds: member.roleIds, roleMap: deps.roleMap }))
			) {
				counts.unchanged++;
				continue;
			}

			const result = await deps.syncMember(member.discordUserId);
			countSyncResult(counts, result);

			const isLastMember = index === members.length - 1;
			if (madeRoleCalls(result) && !isLastMember) {
				await sleep(paceMs);
			}
		}
	} finally {
		unsubscribe();
	}

	return {
		kind: stopReason ? 'partial' : 'completed',
		stopReason,
		targetCount: members.length,
		remaining: members.length - counts.processed,
		...counts
	};
}

async function readChunkTotals(readTotals: ReadMeritBadgeTotals, chunk: readonly MeritBadgeBulkMember[]) {
	try {
		return await readTotals(chunk.map((member) => member.discordUserId));
	} catch {
		return null;
	}
}

function countSyncResult(counts: { updated: number; unchanged: number; memberLeft: number; failed: number }, result: MeritBadgeSyncResult) {
	switch (result.kind) {
		case 'updated':
			counts.updated++;
			return;
		case 'unchanged':
		case 'skipped_bot':
			counts.unchanged++;
			return;
		case 'member_not_found':
			counts.memberLeft++;
			return;
		case 'disabled':
		case 'failed':
			counts.failed++;
			return;
	}
}

function madeRoleCalls(result: MeritBadgeSyncResult) {
	return result.kind === 'updated' || (result.kind === 'failed' && (result.stage === 'add_role' || result.stage === 'remove_role'));
}

/** Non-bot members in Discord ID (snowflake) order, so reruns walk the same order. */
function toSortedHumanMembers(members: readonly MeritBadgeBulkMember[]) {
	return members.filter((member) => !member.isBot).sort((left, right) => compareSnowflakes(left.discordUserId, right.discordUserId));
}

function compareSnowflakes(left: string, right: string) {
	if (left.length !== right.length) {
		return left.length - right.length;
	}
	return left < right ? -1 : left > right ? 1 : 0;
}

function toChunks<T>(items: readonly T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function defaultSleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function safeLog(write: () => void) {
	try {
		write();
	} catch {
		// Logging must never stop a run.
	}
}

/**
 * Allows one live run at a time in this bot process. Dry runs do not take it.
 */
export function createMeritBadgeBulkRunLock() {
	let running = false;
	return {
		/** Returns a release function, or null when a live run is already in progress. */
		tryAcquire(): (() => void) | null {
			if (running) {
				return null;
			}
			running = true;
			let released = false;
			return () => {
				if (!released) {
					released = true;
					running = false;
				}
			};
		}
	};
}

export type MeritBadgeBulkRunLock = ReturnType<typeof createMeritBadgeBulkRunLock>;

export const MERIT_BADGE_BULK_RUN_LOCK: MeritBadgeBulkRunLock = createMeritBadgeBulkRunLock();
