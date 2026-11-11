import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { createMeritBadgeRoleMap } from '../../../../../src/config/meritBadgeRoles';
import { checkMeritBadgeRoles, type GuildRoleSnapshot } from '../../../../../src/lib/services/merit-badge/meritBadgeRoleCheck';

const GUILD_ID = '100000000000000000';
const BOT_ROLE_ID = '100000000000000001';
const STAFF_ROLE_ID = '100000000000000002';
const MOD_ROLE_ID = '100000000000000003';
const MEMBER_ROLE_ID = '100000000000000004';
const BADGE_1_ROLE_ID = '200000000000000001';
const BADGE_2_ROLE_ID = '200000000000000002';

function role(id: string, name: string, position: number, permissions = 0n, hasIcon = false): GuildRoleSnapshot {
	return { id, name, position, permissions, hasIcon };
}

// Healthy order, top to bottom: Arbiter, Moderator, Staff, Ferrum II, Ferrum I, Member, @everyone.
function healthyGuildRoles(): GuildRoleSnapshot[] {
	return [
		role(GUILD_ID, '@everyone', 0),
		role(MEMBER_ROLE_ID, 'Member', 1),
		role(BADGE_1_ROLE_ID, 'Ferrum I', 2, 0n, true),
		role(BADGE_2_ROLE_ID, 'Ferrum II', 3, 0n, true),
		role(STAFF_ROLE_ID, 'Staff', 4),
		role(MOD_ROLE_ID, 'Moderator', 5, PermissionFlagsBits.KickMembers, true),
		role(BOT_ROLE_ID, 'Arbiter', 6, PermissionFlagsBits.ManageRoles)
	];
}

const roleMap = createMeritBadgeRoleMap(
	new Map([
		[1, BADGE_1_ROLE_ID],
		[2, BADGE_2_ROLE_ID]
	])
);

function check(guildRoles: GuildRoleSnapshot[], map = roleMap) {
	return checkMeritBadgeRoles({
		roleMap: map,
		guildRoles,
		everyoneRoleId: GUILD_ID,
		botHighestRoleId: BOT_ROLE_ID,
		staffRoleIds: new Set([STAFF_ROLE_ID])
	});
}

describe('checkMeritBadgeRoles', () => {
	it('reports nothing when no badge role is configured', () => {
		expect(check([], createMeritBadgeRoleMap(new Map()))).toEqual([]);
	});

	it('reports nothing for a correctly ordered guild', () => {
		expect(check(healthyGuildRoles())).toEqual([]);
	});

	it('reports a configured role that does not exist in the guild', () => {
		const roles = healthyGuildRoles().filter((guildRole) => guildRole.id !== BADGE_2_ROLE_ID);

		expect(check(roles)).toEqual([{ kind: 'role_missing', tier: 2, tierLabel: 'Ferrum II', roleId: BADGE_2_ROLE_ID }]);
	});

	it('reports a badge role above the bot, staff and moderation roles', () => {
		const roles = healthyGuildRoles().map((guildRole) => (guildRole.id === BADGE_2_ROLE_ID ? { ...guildRole, position: 7 } : guildRole));

		expect(check(roles)).toEqual([
			expect.objectContaining({ kind: 'not_below_bot_role', tier: 2, otherRoleId: BOT_ROLE_ID }),
			expect.objectContaining({ kind: 'not_below_staff_role', tier: 2, otherRoleId: STAFF_ROLE_ID }),
			expect.objectContaining({ kind: 'not_below_moderation_role', tier: 2, otherRoleId: MOD_ROLE_ID })
		]);
	});

	it('reports a badge role at or above a staff role but below moderation roles', () => {
		const roles = healthyGuildRoles().map((guildRole) => {
			if (guildRole.id === BADGE_2_ROLE_ID) return { ...guildRole, position: 4 };
			if (guildRole.id === STAFF_ROLE_ID) return { ...guildRole, position: 3 };
			return guildRole;
		});

		expect(check(roles)).toEqual([
			{
				kind: 'not_below_staff_role',
				tier: 2,
				tierLabel: 'Ferrum II',
				roleId: BADGE_2_ROLE_ID,
				roleName: 'Ferrum II',
				otherRoleId: STAFF_ROLE_ID,
				otherRoleName: 'Staff'
			}
		]);
	});

	it('reports a badge role ID that is also a STAFF division role', () => {
		expect(
			checkMeritBadgeRoles({
				roleMap,
				guildRoles: healthyGuildRoles(),
				everyoneRoleId: GUILD_ID,
				botHighestRoleId: BOT_ROLE_ID,
				staffRoleIds: new Set([STAFF_ROLE_ID, BADGE_1_ROLE_ID])
			})
		).toEqual([
			expect.objectContaining({ kind: 'not_below_staff_role', tier: 1, otherRoleId: BADGE_1_ROLE_ID }),
			expect.objectContaining({ kind: 'not_below_staff_role', tier: 2, otherRoleId: BADGE_1_ROLE_ID })
		]);
	});

	it('reports a badge role that grants moderation permissions', () => {
		const roles = healthyGuildRoles().map((guildRole) =>
			guildRole.id === BADGE_1_ROLE_ID ? { ...guildRole, permissions: PermissionFlagsBits.ManageMessages } : guildRole
		);

		expect(check(roles)).toEqual([
			{ kind: 'has_moderation_permissions', tier: 1, tierLabel: 'Ferrum I', roleId: BADGE_1_ROLE_ID, roleName: 'Ferrum I', hasIcon: true }
		]);
	});

	it('ignores moderation permissions on @everyone when comparing positions', () => {
		const roles = healthyGuildRoles().map((guildRole) =>
			guildRole.id === GUILD_ID ? { ...guildRole, permissions: PermissionFlagsBits.MuteMembers } : guildRole
		);

		expect(check(roles)).toEqual([]);
	});
});
