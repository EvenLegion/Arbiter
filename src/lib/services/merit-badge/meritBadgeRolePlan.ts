import type { MeritBadgeTier } from '@arbiter/domain';

import type { MeritBadgeRoleMap } from '../../../config/meritBadgeRoles';
import { resolveMeritBadgeTier } from '../merit-rank/meritBadge';

export type MeritBadgeRolePlan = Readonly<{
	/** The tier the member's total earns, or null when they have no badge (under 1 merit or a non-finite total). */
	desiredTier: MeritBadgeTier | null;
	/** The tier whose role the member should hold: the highest configured tier at or below `desiredTier`. */
	appliedTier: MeritBadgeTier | null;
	appliedRoleId: string | null;
	/** True when the member earns a tier whose role is not configured yet, so a lower tier (or none) is applied. */
	tierRoleMissing: boolean;
	/** The highest badge tier the member holds in Discord before the sync, or null. */
	previousTier: MeritBadgeTier | null;
	/** The role to add, or null when the member already holds it or should hold none. */
	roleIdToAdd: string | null;
	/** Every other badge role the member holds, in ladder order. */
	roleIdsToRemove: readonly string[];
}>;

/**
 * Plans the badge role changes for one member. Pure: no Discord or database access.
 *
 * Discord roles are output only (D6). The member's current roles are read here only to work out
 * which configured badge roles to add or remove; roles that are not configured badge roles are
 * never touched.
 */
export function planMeritBadgeRoles({
	totalMerits,
	currentRoleIds,
	roleMap
}: {
	totalMerits: number;
	currentRoleIds: Iterable<string>;
	roleMap: MeritBadgeRoleMap;
}): MeritBadgeRolePlan {
	const desiredTier = resolveMeritBadgeTier(totalMerits);
	const appliedRole = desiredTier ? roleMap.resolveConfiguredRoleAtOrBelow(desiredTier.tier) : null;
	const appliedRoleId = appliedRole?.roleId ?? null;

	const heldBadgeRoles: { tier: MeritBadgeTier; roleId: string }[] = [];
	for (const roleId of new Set(currentRoleIds)) {
		const tier = roleMap.byRoleId(roleId);
		if (tier) {
			heldBadgeRoles.push({ tier, roleId });
		}
	}
	heldBadgeRoles.sort((left, right) => left.tier.tier - right.tier.tier);

	const holdsAppliedRole = heldBadgeRoles.some((held) => held.roleId === appliedRoleId);

	return Object.freeze({
		desiredTier,
		appliedTier: appliedRole?.tier ?? null,
		appliedRoleId,
		tierRoleMissing: desiredTier !== null && appliedRole?.tier.tier !== desiredTier.tier,
		previousTier: heldBadgeRoles.at(-1)?.tier ?? null,
		roleIdToAdd: appliedRoleId !== null && !holdsAppliedRole ? appliedRoleId : null,
		roleIdsToRemove: Object.freeze(heldBadgeRoles.filter((held) => held.roleId !== appliedRoleId).map((held) => held.roleId))
	});
}

export function isMeritBadgeRolePlanNoOp(plan: MeritBadgeRolePlan) {
	return plan.roleIdToAdd === null && plan.roleIdsToRemove.length === 0;
}
