import { describe, expect, it, vi } from 'vitest';

import { applyDivisionMembershipMutation } from '../../../../../src/lib/services/division-membership/divisionMembershipService';

describe('divisionMembershipService', () => {
	it('adds a membership and forwards the nickname sync summary', async () => {
		const addMemberships = vi.fn(async () => ({ count: 1 }));

		const result = await applyDivisionMembershipMutation(
			{
				findTargetUser: async () => ({
					id: 'db-user-1',
					discordUserId: '3001',
					discordUsername: 'member-one'
				}),
				findDivision: async () => ({
					id: 9,
					code: 'NAVY',
					name: 'Navy'
				}),
				listMemberships: async () => [],
				addMemberships,
				removeMemberships: vi.fn(async () => ({ count: 0 })),
				syncNickname: async () => ({
					kind: 'updated',
					computedNickname: 'NAVY | Member'
				})
			},
			{
				mode: 'add',
				targetDiscordUserId: '3001',
				divisionSelection: 'NAVY',
				syncNickname: true
			}
		);

		expect(addMemberships).toHaveBeenCalledWith({
			userId: 'db-user-1',
			divisionIds: [9]
		});
		expect(result).toEqual({
			kind: 'updated',
			mode: 'add',
			targetDiscordUserId: '3001',
			targetDbUserId: 'db-user-1',
			targetDiscordUsername: 'member-one',
			divisionId: 9,
			divisionCode: 'NAVY',
			divisionName: 'Navy',
			changeCount: 1,
			nicknameSync: {
				kind: 'updated',
				computedNickname: 'NAVY | Member'
			}
		});
	});

	it('short-circuits when removing a membership the user does not have', async () => {
		const result = await applyDivisionMembershipMutation(
			{
				findTargetUser: async () => ({
					id: 'db-user-2',
					discordUserId: '3002',
					discordUsername: 'member-two'
				}),
				findDivision: async () => ({
					id: 10,
					code: 'SUP',
					name: 'Support'
				}),
				listMemberships: async () => [],
				addMemberships: vi.fn(async () => ({ count: 0 })),
				removeMemberships: vi.fn(async () => ({ count: 0 })),
				syncNickname: vi.fn(async () => ({
					kind: 'failed'
				}))
			},
			{
				mode: 'remove',
				targetDiscordUserId: '3002',
				divisionSelection: 'SUP',
				syncNickname: true
			}
		);

		expect(result).toEqual({
			kind: 'membership_missing',
			targetDiscordUserId: '3002',
			divisionName: 'Support'
		});
	});
});
