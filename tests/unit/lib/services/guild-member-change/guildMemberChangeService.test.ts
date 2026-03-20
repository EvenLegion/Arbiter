import { describe, expect, it } from 'vitest';

import {
	computeGuildMemberRoleDiff,
	mapNicknameSyncResult,
	processGuildMemberRoleChange
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
				})
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
				})
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
			}
		});
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
