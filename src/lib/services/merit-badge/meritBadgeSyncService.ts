import type { MeritBadgeRoleMap } from '../../../config/meritBadgeRoles';
import type { ContextLogger } from '../../logging/executionContext';
import type { RunExclusive } from './meritBadgeMemberLock';
import type { MeritBadgeRoleChangeResult, MeritBadgeRoleErrorCode } from './meritBadgeRoleGateway';
import { isMeritBadgeRolePlanNoOp, planMeritBadgeRoles, type MeritBadgeRolePlan } from './meritBadgeRolePlan';

export type MeritBadgeSyncDeps<TMember> = {
	roleMap: MeritBadgeRoleMap;
	runExclusive: RunExclusive;
	logger: ContextLogger;
	getMember: (discordUserId: string) => Promise<TMember | null>;
	describeMember: (member: TMember) => { isBot: boolean; roleIds: Iterable<string> };
	/** Reads the member's merit total from Postgres. A member with no User row has 0. */
	readTotalMerits: (discordUserId: string) => Promise<number>;
	addRole: (member: TMember, roleId: string) => Promise<MeritBadgeRoleChangeResult>;
	removeRole: (member: TMember, roleId: string) => Promise<MeritBadgeRoleChangeResult>;
};

export type MeritBadgeSyncInput = {
	discordUserId: string;
	/**
	 * A total the caller has just read after its own write committed, to skip a second read.
	 * Listener paths never pass one; they always re-read.
	 */
	totalMeritsOverride?: number;
};

export type MeritBadgeSyncStage = 'guild' | 'load_member' | 'read_total' | 'add_role' | 'remove_role' | 'unexpected';

export type MeritBadgeSyncFailureCode = MeritBadgeRoleErrorCode | 'wrong_guild' | 'read_failed' | 'invalid_total' | 'unexpected';

type PlannedFields = {
	discordUserId: string;
	totalMerits: number;
	plan: MeritBadgeRolePlan;
};

export type MeritBadgeSyncFailure = {
	kind: 'failed';
	discordUserId: string;
	stage: MeritBadgeSyncStage;
	code: MeritBadgeSyncFailureCode;
	totalMerits?: number;
	plan?: MeritBadgeRolePlan;
	/** The role added before a later removal failed, or null. */
	addedRoleId: string | null;
	/** Roles removed before a removal failed. */
	removedRoleIds: string[];
};

export type MeritBadgeSyncResult =
	| { kind: 'disabled'; discordUserId: string }
	| { kind: 'member_not_found'; discordUserId: string }
	| { kind: 'skipped_bot'; discordUserId: string }
	| ({ kind: 'unchanged' } & PlannedFields)
	| ({ kind: 'updated'; addedRoleId: string | null; removedRoleIds: string[] } & PlannedFields)
	| MeritBadgeSyncFailure;

/**
 * Computes and applies one member's badge role from their Postgres total.
 *
 * - Does nothing (no reads, no Discord calls) while no badge role is configured.
 * - Runs inside the per-member lock, so two syncs for one member never interleave.
 * - A member who already holds the right role, and no other badge role, gets zero Discord calls.
 * - Adds the new role before removing old ones; if the add fails, the old badge stays.
 * - Never throws.
 */
export async function syncMemberMeritBadge<TMember>(deps: MeritBadgeSyncDeps<TMember>, input: MeritBadgeSyncInput): Promise<MeritBadgeSyncResult> {
	const { discordUserId } = input;
	if (!deps.roleMap.isEnabled) {
		return { kind: 'disabled', discordUserId };
	}

	let result: MeritBadgeSyncResult;
	try {
		result = await deps.runExclusive(discordUserId, () => syncInsideLock(deps, input));
	} catch (error) {
		result = failure({ discordUserId, stage: 'unexpected', code: 'unexpected' });
		safeLog(() =>
			deps.logger.error({ discordUserId, errorName: error instanceof Error ? error.name : undefined }, 'merit_badge.sync.unexpected_error')
		);
	}

	safeLog(() => logResult(deps.logger, result));
	return result;
}

async function syncInsideLock<TMember>(
	deps: MeritBadgeSyncDeps<TMember>,
	{ discordUserId, totalMeritsOverride }: MeritBadgeSyncInput
): Promise<MeritBadgeSyncResult> {
	let member: TMember | null;
	try {
		member = await deps.getMember(discordUserId);
	} catch {
		return failure({ discordUserId, stage: 'load_member', code: 'request_failed' });
	}
	if (!member) {
		return { kind: 'member_not_found', discordUserId };
	}

	const { isBot, roleIds } = deps.describeMember(member);
	if (isBot) {
		return { kind: 'skipped_bot', discordUserId };
	}

	let totalMerits: number;
	if (totalMeritsOverride !== undefined) {
		totalMerits = totalMeritsOverride;
	} else {
		try {
			totalMerits = await deps.readTotalMerits(discordUserId);
		} catch {
			return failure({ discordUserId, stage: 'read_total', code: 'read_failed' });
		}
	}
	// A bad total must never strip badges, so it fails instead of planning "no badge".
	if (!Number.isFinite(totalMerits)) {
		return failure({ discordUserId, stage: 'read_total', code: 'invalid_total' });
	}

	const plan = planMeritBadgeRoles({ totalMerits, currentRoleIds: roleIds, roleMap: deps.roleMap });
	if (plan.tierRoleMissing) {
		safeLog(() =>
			deps.logger.info(
				{ discordUserId, desiredTier: plan.desiredTier?.tier ?? null, appliedTier: plan.appliedTier?.tier ?? null, tierRoleMissing: true },
				'merit_badge.sync.tier_role_missing'
			)
		);
	}

	if (isMeritBadgeRolePlanNoOp(plan)) {
		return { kind: 'unchanged', discordUserId, totalMerits, plan };
	}

	if (plan.roleIdToAdd) {
		const added = await deps.addRole(member, plan.roleIdToAdd);
		if (!added.ok) {
			return failure({ discordUserId, stage: 'add_role', code: added.code, totalMerits, plan });
		}
	}

	const removedRoleIds: string[] = [];
	for (const roleId of plan.roleIdsToRemove) {
		const removed = await deps.removeRole(member, roleId);
		if (!removed.ok) {
			return failure({
				discordUserId,
				stage: 'remove_role',
				code: removed.code,
				totalMerits,
				plan,
				addedRoleId: plan.roleIdToAdd,
				removedRoleIds
			});
		}
		removedRoleIds.push(roleId);
	}

	return { kind: 'updated', discordUserId, totalMerits, plan, addedRoleId: plan.roleIdToAdd, removedRoleIds };
}

function failure(
	fields: Omit<MeritBadgeSyncFailure, 'kind' | 'addedRoleId' | 'removedRoleIds'> & Partial<MeritBadgeSyncFailure>
): MeritBadgeSyncFailure {
	return { kind: 'failed', addedRoleId: null, removedRoleIds: [], ...fields };
}

/** Logs IDs, tiers and the outcome only: no names, no totals, no raw errors. */
function logResult(logger: ContextLogger, result: MeritBadgeSyncResult) {
	switch (result.kind) {
		case 'disabled':
			return;
		case 'member_not_found':
		case 'skipped_bot':
			logger.debug({ discordUserId: result.discordUserId, outcome: result.kind }, 'merit_badge.sync.completed');
			return;
		case 'unchanged':
		case 'updated':
			logger[result.kind === 'updated' ? 'info' : 'debug'](
				{
					discordUserId: result.discordUserId,
					outcome: result.kind,
					...tierFields(result.plan),
					...(result.kind === 'updated' ? { addedRoleId: result.addedRoleId, removedRoleIds: result.removedRoleIds } : {})
				},
				'merit_badge.sync.completed'
			);
			return;
		case 'failed':
			logger.warn(
				{
					discordUserId: result.discordUserId,
					outcome: result.kind,
					stage: result.stage,
					code: result.code,
					...(result.plan ? tierFields(result.plan) : {}),
					addedRoleId: result.addedRoleId,
					removedRoleIds: result.removedRoleIds
				},
				'merit_badge.sync.failed'
			);
			return;
	}
}

function tierFields(plan: MeritBadgeRolePlan) {
	return {
		desiredTier: plan.desiredTier?.tier ?? null,
		appliedTier: plan.appliedTier?.tier ?? null,
		previousTier: plan.previousTier?.tier ?? null,
		tierRoleMissing: plan.tierRoleMissing
	};
}

function safeLog(write: () => void) {
	try {
		write();
	} catch {
		// Logging must never turn a sync result into a thrown error.
	}
}
