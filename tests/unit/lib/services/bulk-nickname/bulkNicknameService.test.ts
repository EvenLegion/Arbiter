import { describe, expect, it, vi } from 'vitest';

import {
	syncBulkNicknames,
	transformBulkNicknames,
	type BulkNicknameTarget
} from '../../../../../src/lib/services/bulk-nickname/bulkNicknameService';

type TestMember = {
	id: string;
	currentNickname: string;
};

describe('bulkNicknameService', () => {
	it('aggregates sync results across updated, unchanged, skipped, missing, and failed targets', async () => {
		const targets = buildTargets(['1001', '1002', '1003', '1004', '1005', '1006']);
		const result = await syncBulkNicknames(
			{
				resolveTargets: async () => targets,
				listMembers: async () =>
					new Map<string, TestMember>([
						['1001', { id: '1001', currentNickname: 'Alpha' }],
						['1002', { id: '1002', currentNickname: 'Bravo' }],
						['1003', { id: '1003', currentNickname: 'Charlie' }],
						['1005', { id: '1005', currentNickname: 'Echo' }],
						['1006', { id: '1006', currentNickname: 'Foxtrot' }]
					]),
				getMember: async () => null,
				syncNickname: vi.fn(async ({ target }) => {
					if (target.discordUserId === '1001') {
						return {
							outcome: 'updated' as const
						};
					}
					if (target.discordUserId === '1002') {
						return {
							outcome: 'unchanged' as const
						};
					}
					if (target.discordUserId === '1003') {
						return {
							outcome: 'skipped' as const,
							reason: 'User has a staff role'
						};
					}
					if (target.discordUserId === '1005') {
						return {
							outcome: 'skipped' as const,
							reason: 'User is the guild owner'
						};
					}

					throw new Error('Failed setting nickname');
				})
			},
			{
				includeStaff: false
			}
		);

		expect(result).toEqual({
			kind: 'completed',
			scope: 'all',
			targetCount: 6,
			attempted: 5,
			updated: 1,
			unchanged: 1,
			skippedStaff: 1,
			skippedByRule: 1,
			missingInGuild: 1,
			failed: 1,
			failures: [
				{
					discordUserId: '1006',
					discordUsername: 'user-1006',
					dbUserId: 'db-1006',
					reason: 'Failed setting nickname'
				}
			]
		});
	});

	it('reports transform summaries with failures and missing members', async () => {
		const setNickname = vi.fn(async () => undefined);
		const targets = [
			{
				id: 'db-2001',
				discordUserId: '2001',
				discordUsername: 'reset-user',
				discordNickname: 'Reset Name'
			},
			{
				id: 'db-2002',
				discordUserId: '2002',
				discordUsername: 'same-user',
				discordNickname: 'Same Name'
			},
			{
				id: 'db-2003',
				discordUserId: '2003',
				discordUsername: 'empty-user',
				discordNickname: '   '
			},
			{
				id: 'db-2004',
				discordUserId: '2004',
				discordUsername: 'missing-user',
				discordNickname: 'Missing Name'
			},
			{
				id: 'db-2005',
				discordUserId: '2005',
				discordUsername: 'long-user',
				discordNickname: 'x'.repeat(40)
			}
		] satisfies BulkNicknameTarget[];

		const result = await transformBulkNicknames(
			{
				resolveTargets: async () => targets,
				listMembers: async () =>
					new Map<string, TestMember>([
						['2001', { id: '2001', currentNickname: 'Before Reset' }],
						['2002', { id: '2002', currentNickname: 'Same Name' }],
						['2003', { id: '2003', currentNickname: 'Will Empty' }],
						['2005', { id: '2005', currentNickname: 'Before Long' }]
					]),
				getMember: async () => null,
				getCurrentNickname: (member) => member.currentNickname,
				setNickname
			},
			{
				mode: 'reset'
			}
		);

		expect(setNickname).toHaveBeenCalledOnce();
		expect(setNickname).toHaveBeenCalledWith({
			target: expect.objectContaining({
				discordUserId: '2001'
			}),
			member: {
				id: '2001',
				currentNickname: 'Before Reset'
			},
			nextNickname: 'Reset Name',
			reason: 'Development nickname reset'
		});
		expect(result).toEqual({
			kind: 'completed',
			scope: 'all',
			mode: 'reset',
			targetCount: 5,
			updated: 1,
			unchanged: 1,
			missingInGuild: 1,
			failed: 2,
			failures: [
				{
					discordUserId: '2003',
					discordUsername: 'empty-user',
					dbUserId: 'db-2003',
					reason: 'Computed nickname was empty'
				},
				{
					discordUserId: '2005',
					discordUsername: 'long-user',
					dbUserId: 'db-2005',
					reason: 'Computed nickname length 40 exceeds 32'
				}
			]
		});
	});
});

function buildTargets(discordUserIds: string[]): BulkNicknameTarget[] {
	return discordUserIds.map((discordUserId) => ({
		id: `db-${discordUserId}`,
		discordUserId,
		discordUsername: `user-${discordUserId}`,
		discordNickname: `nickname-${discordUserId}`
	}));
}
