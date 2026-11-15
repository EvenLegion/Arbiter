import { describe, expect, it, vi } from 'vitest';

import {
	computeGuildMemberRoleDiff,
	isBadgeOnlyRoleDiff,
	mapNicknameSyncResult,
	processGuildMemberRoleChange,
	toGuildMemberBadgeOutcome
} from '../../../../../src/lib/services/guild-member-change/guildMemberChangeService';

describe('guildMemberChangeService', () => {
	it('marks partial payloads as actionable even without an explicit role diff', () => {
		expect(
			computeGuildMemberRoleDiff({
				oldMemberIsPartial: true,
				oldRoleIds: ['role-a'],
				newRoleIds: ['role-a']
			})
		).toEqual({
			oldMemberIsPartial: true,
			haveRolesChanged: true,
			oldRoleIds: [],
			newRoleIds: ['role-a'],
			addedRoleIds: ['role-a'],
			removedRoleIds: []
		});
	});

	it('returns member_not_found when the guild member cannot be resolved', async () => {
		const result = await processGuildMemberRoleChange(
			{
				resolveMember: async () => null,
				reconcileMemberships: async () => ({
					addedDivisions: [],
					removedDivisions: []
				}),
				syncNickname: async () => ({
					kind: 'unchanged',
					computedNickname: 'unchanged'
				}),
				isBadgeRole: () => false,
				syncBadge: async () => ({ kind: 'unchanged' })
			},
			{
				discordUserId: '42',
				oldMemberIsPartial: false,
				oldRoleIds: [],
				newRoleIds: ['role-a']
			}
		);

		expect(result.kind).toBe('member_not_found');
	});

	it('processes membership reconciliation and nickname sync through injected deps', async () => {
		const member = {
			id: '77'
		};

		const result = await processGuildMemberRoleChange(
			{
				resolveMember: async () => member,
				reconcileMemberships: async () => ({
					addedDivisions: [{ id: 1, name: 'Navy', discordRoleId: 'role-navy' }],
					removedDivisions: []
				}),
				syncNickname: async () => ({
					kind: 'updated',
					computedNickname: 'NAV John'
				}),
				isBadgeRole: () => false,
				syncBadge: async () => ({ kind: 'unchanged' })
			},
			{
				discordUserId: '77',
				oldMemberIsPartial: false,
				oldRoleIds: [],
				newRoleIds: ['role-navy']
			}
		);

		expect(result).toEqual({
			kind: 'processed',
			discordUserId: '77',
			roleDiff: {
				oldMemberIsPartial: false,
				haveRolesChanged: true,
				oldRoleIds: [],
				newRoleIds: ['role-navy'],
				addedRoleIds: ['role-navy'],
				removedRoleIds: []
			},
			membership: {
				addedDivisions: [{ id: 1, name: 'Navy', discordRoleId: 'role-navy' }],
				removedDivisions: []
			},
			nickname: {
				kind: 'updated',
				computedNickname: 'NAV John'
			},
			badge: {
				kind: 'unchanged'
			}
		});
	});

	it('only re-checks the badge on a badge-only role change', async () => {
		const deps = createBadgeAwareDeps();

		const result = await processGuildMemberRoleChange(deps, {
			discordUserId: '88',
			oldMemberIsPartial: false,
			oldRoleIds: ['role-navy', 'badge-1'],
			newRoleIds: ['role-navy', 'badge-2']
		});

		expect(result).toEqual(
			expect.objectContaining({
				kind: 'badge_only',
				discordUserId: '88',
				badge: { kind: 'updated' }
			})
		);
		expect(deps.resolveMember).not.toHaveBeenCalled();
		expect(deps.reconcileMemberships).not.toHaveBeenCalled();
		expect(deps.syncNickname).not.toHaveBeenCalled();
		// Listener paths never pass a total override.
		expect(deps.syncBadge).toHaveBeenCalledWith({ discordUserId: '88' });
	});

	it('runs the full workflow and then the badge sync when a non-badge role also changed', async () => {
		const deps = createBadgeAwareDeps();

		const result = await processGuildMemberRoleChange(deps, {
			discordUserId: '88',
			oldMemberIsPartial: false,
			oldRoleIds: ['badge-1'],
			newRoleIds: ['role-navy', 'badge-2']
		});

		expect(result.kind).toBe('processed');
		expect(deps.reconcileMemberships).toHaveBeenCalledTimes(1);
		expect(deps.syncNickname).toHaveBeenCalledTimes(1);
		expect(deps.syncBadge).toHaveBeenCalledWith({ discordUserId: '88' });
		expect(deps.syncBadge.mock.invocationCallOrder[0]).toBeGreaterThan(deps.syncNickname.mock.invocationCallOrder[0]);
	});

	it('treats a partial old member as a full role change even when only badge roles are present', async () => {
		const deps = createBadgeAwareDeps();

		const result = await processGuildMemberRoleChange(deps, {
			discordUserId: '88',
			oldMemberIsPartial: true,
			oldRoleIds: [],
			newRoleIds: ['badge-2']
		});

		expect(result.kind).toBe('processed');
		expect(deps.reconcileMemberships).toHaveBeenCalledTimes(1);
		expect(deps.syncNickname).toHaveBeenCalledTimes(1);
	});

	it('does not run the badge sync when no role changed', async () => {
		const deps = createBadgeAwareDeps();

		const result = await processGuildMemberRoleChange(deps, {
			discordUserId: '88',
			oldMemberIsPartial: false,
			oldRoleIds: ['badge-1'],
			newRoleIds: ['badge-1']
		});

		expect(result.kind).toBe('skipped_no_role_change');
		expect(deps.syncBadge).not.toHaveBeenCalled();
	});

	it('classifies badge-only diffs', () => {
		const isBadgeRole = (roleId: string) => roleId.startsWith('badge-');
		const diff = (oldRoleIds: string[], newRoleIds: string[], oldMemberIsPartial = false) =>
			computeGuildMemberRoleDiff({ oldMemberIsPartial, oldRoleIds, newRoleIds });

		expect(isBadgeOnlyRoleDiff(diff(['a'], ['a', 'badge-1']), isBadgeRole)).toBe(true);
		expect(isBadgeOnlyRoleDiff(diff(['a', 'badge-1'], ['a']), isBadgeRole)).toBe(true);
		expect(isBadgeOnlyRoleDiff(diff(['badge-1'], ['b', 'badge-1']), isBadgeRole)).toBe(false);
		expect(isBadgeOnlyRoleDiff(diff(['a'], ['a']), isBadgeRole)).toBe(false);
		expect(isBadgeOnlyRoleDiff(diff([], ['badge-1'], true), isBadgeRole)).toBe(false);
		// No configured badge roles: nothing is badge-only.
		expect(isBadgeOnlyRoleDiff(diff(['a'], ['a', 'badge-1']), () => false)).toBe(false);
	});

	it('keeps only the kind, stage and code of a badge sync result', () => {
		expect(
			toGuildMemberBadgeOutcome({
				kind: 'failed',
				discordUserId: '88',
				stage: 'add_role',
				code: 'missing_permissions',
				totalMerits: 40,
				addedRoleId: null,
				removedRoleIds: []
			})
		).toEqual({ kind: 'failed', stage: 'add_role', code: 'missing_permissions' });
		expect(toGuildMemberBadgeOutcome({ kind: 'disabled', discordUserId: '88' })).toEqual({ kind: 'disabled' });
	});

	it('maps nickname sync failures into domain outcomes', () => {
		expect(
			mapNicknameSyncResult({
				kind: 'nickname-too-long'
			})
		).toEqual({
			kind: 'sync_failed',
			reason: 'nickname-too-long'
		});
	});
});

function createBadgeAwareDeps() {
	return {
		resolveMember: vi.fn(async () => ({ id: '88' })),
		reconcileMemberships: vi.fn(async () => ({
			addedDivisions: [],
			removedDivisions: []
		})),
		syncNickname: vi.fn(async () => ({
			kind: 'unchanged' as const,
			computedNickname: 'John'
		})),
		isBadgeRole: (roleId: string) => roleId.startsWith('badge-'),
		syncBadge: vi.fn(async () => ({ kind: 'updated' as const }))
	};
}
