import { PermissionFlagsBits } from 'discord.js';

import type { MeritBadgeRoleMap } from '../../../config/meritBadgeRoles';

/**
 * Read-only check of the admin-provided badge roles against the guild's role list.
 *
 * It reports problems; it never edits a role and never blocks badge writes. The admin owns
 * role creation and order (D2, D5, D11).
 */

export const MODERATION_PERMISSION_FLAGS: readonly bigint[] = Object.freeze([
	PermissionFlagsBits.Administrator,
	PermissionFlagsBits.ManageGuild,
	PermissionFlagsBits.ManageRoles,
	PermissionFlagsBits.ManageChannels,
	PermissionFlagsBits.ManageWebhooks,
	PermissionFlagsBits.ManageMessages,
	PermissionFlagsBits.ManageThreads,
	PermissionFlagsBits.ManageNicknames,
	PermissionFlagsBits.KickMembers,
	PermissionFlagsBits.BanMembers,
	PermissionFlagsBits.ModerateMembers,
	PermissionFlagsBits.MuteMembers,
	PermissionFlagsBits.DeafenMembers,
	PermissionFlagsBits.MoveMembers
]);

export type GuildRoleSnapshot = Readonly<{
	id: string;
	name: string;
	/** Discord role position; higher sits above. */
	position: number;
	permissions: bigint;
	hasIcon: boolean;
}>;

type BadgeRoleRef = { tier: number; tierLabel: string; roleId: string };
type OtherRoleRef = { otherRoleId: string; otherRoleName: string };

export type MeritBadgeRoleIssue =
	| ({ kind: 'role_missing' } & BadgeRoleRef)
	| ({ kind: 'not_below_bot_role'; roleName: string } & BadgeRoleRef & OtherRoleRef)
	| ({ kind: 'not_below_staff_role'; roleName: string } & BadgeRoleRef & OtherRoleRef)
	| ({ kind: 'not_below_moderation_role'; roleName: string } & BadgeRoleRef & OtherRoleRef)
	| ({ kind: 'has_moderation_permissions'; roleName: string; hasIcon: boolean } & BadgeRoleRef);

export function hasModerationPermissions(permissions: bigint) {
	return MODERATION_PERMISSION_FLAGS.some((flag) => (permissions & flag) === flag);
}

/**
 * @param guildRoles every role in the configured guild, including @everyone
 * @param everyoneRoleId the @everyone role ID (the guild ID); it is never treated as a staff or moderation role
 * @param botHighestRoleId Arbiter's highest role in the guild
 * @param staffRoleIds Discord role IDs of STAFF-kind divisions
 */
export function checkMeritBadgeRoles({
	roleMap,
	guildRoles,
	everyoneRoleId,
	botHighestRoleId,
	staffRoleIds
}: {
	roleMap: MeritBadgeRoleMap;
	guildRoles: readonly GuildRoleSnapshot[];
	everyoneRoleId: string;
	botHighestRoleId: string;
	staffRoleIds: ReadonlySet<string>;
}): MeritBadgeRoleIssue[] {
	const issues: MeritBadgeRoleIssue[] = [];
	if (!roleMap.isEnabled) {
		return issues;
	}

	const rolesById = new Map(guildRoles.map((role) => [role.id, role] as const));
	const botHighestRole = rolesById.get(botHighestRoleId) ?? null;
	const protectedRoles = guildRoles.filter((role) => role.id !== everyoneRoleId && !roleMap.roleIds.has(role.id));
	const lowestStaffRole = findLowest(protectedRoles.filter((role) => staffRoleIds.has(role.id)));
	const lowestModerationRole = findLowest(protectedRoles.filter((role) => hasModerationPermissions(role.permissions)));

	for (const { tier, roleId } of roleMap.configuredRoles) {
		const ref: BadgeRoleRef = { tier: tier.tier, tierLabel: tier.label, roleId };
		const role = rolesById.get(roleId);
		if (!role) {
			issues.push({ kind: 'role_missing', ...ref });
			continue;
		}

		if (botHighestRole && role.position >= botHighestRole.position) {
			issues.push({ kind: 'not_below_bot_role', ...ref, roleName: role.name, ...otherRoleRef(botHighestRole) });
		}
		if (lowestStaffRole && role.position >= lowestStaffRole.position) {
			issues.push({ kind: 'not_below_staff_role', ...ref, roleName: role.name, ...otherRoleRef(lowestStaffRole) });
		}
		if (lowestModerationRole && role.position >= lowestModerationRole.position) {
			issues.push({ kind: 'not_below_moderation_role', ...ref, roleName: role.name, ...otherRoleRef(lowestModerationRole) });
		}
		if (hasModerationPermissions(role.permissions)) {
			issues.push({ kind: 'has_moderation_permissions', ...ref, roleName: role.name, hasIcon: role.hasIcon });
		}
	}

	return issues;
}

function findLowest(roles: readonly GuildRoleSnapshot[]) {
	return roles.reduce<GuildRoleSnapshot | null>((lowest, role) => (!lowest || role.position < lowest.position ? role : lowest), null);
}

function otherRoleRef(role: GuildRoleSnapshot): OtherRoleRef {
	return { otherRoleId: role.id, otherRoleName: role.name };
}
