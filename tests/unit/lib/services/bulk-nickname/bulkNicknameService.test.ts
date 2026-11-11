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

const sleep = async () => undefined;

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
				}),
				sleep
			},
			{
				includeStaff: false
			}
		);

		expect(result).toEqual({
			kind: 'completed',
			scope: 'all',
			targetCount: 6,
			stopReason: null,
			remaining: 0,
			rateLimitWaits: 0,
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
			],
			dryRun: false,
			plan: []
		});
	});

	it('passes dry_run to every member and lists planned changes, skipped staff and failures', async () => {
		const targets = buildTargets(['1001', '1002', '1003', '1004', '1005']);
		const syncNickname = vi.fn(async ({ target }: { target: BulkNicknameTarget }) => {
			switch (target.discordUserId) {
				case '1001':
					return { outcome: 'updated' as const, currentNickname: 'Alpha (edited by hand)', computedNickname: 'LGN | Alpha' };
				case '1002':
					return { outcome: 'unchanged' as const, currentNickname: 'LGN | Bravo', computedNickname: 'LGN | Bravo' };
				case '1003':
					return { outcome: 'skipped' as const, reason: 'User has a staff role', currentNickname: null, computedNickname: null };
				case '1004':
					return { outcome: 'skipped' as const, reason: 'User is the guild owner', currentNickname: 'Owner', computedNickname: null };
				default:
					throw new Error('Failed to sync nickname: nickname-too-long');
			}
		});

		const result = await syncBulkNicknames(
			{
				resolveTargets: async () => targets,
				listMembers: async () => new Map(targets.map((target) => [target.discordUserId, { id: target.discordUserId, currentNickname: '' }])),
				getMember: async () => null,
				syncNickname
			},
			{ includeStaff: false, dryRun: true }
		);

		expect(syncNickname).toHaveBeenCalledTimes(5);
		for (const call of syncNickname.mock.calls) {
			expect(call[0]).toMatchObject({ includeStaff: false, dryRun: true });
		}
		expect(result).toMatchObject({ kind: 'completed', dryRun: true, updated: 1, unchanged: 1, skippedStaff: 1, skippedByRule: 1, failed: 1 });
		expect(result.kind === 'completed' && result.plan).toEqual([
			{
				discordUserId: '1001',
				discordUsername: 'user-1001',
				action: 'change',
				currentNickname: 'Alpha (edited by hand)',
				plannedNickname: 'LGN | Alpha',
				reason: null
			},
			{
				discordUserId: '1003',
				discordUsername: 'user-1003',
				action: 'skipped_staff',
				currentNickname: null,
				plannedNickname: null,
				reason: null
			},
			{
				discordUserId: '1005',
				discordUsername: 'user-1005',
				action: 'failed',
				currentNickname: null,
				plannedNickname: null,
				reason: 'Failed to sync nickname: nickname-too-long'
			}
		]);
	});

	it('pauses after each live nickname change, but not after the last target or on a dry run', async () => {
		const targets = buildTargets(['1001', '1002', '1003']);
		const deps = {
			resolveTargets: async () => targets,
			listMembers: async () => new Map(targets.map((target) => [target.discordUserId, { id: target.discordUserId, currentNickname: '' }])),
			getMember: async () => null,
			syncNickname: vi.fn(async ({ target }: { target: BulkNicknameTarget }) => ({
				outcome: target.discordUserId === '1002' ? ('unchanged' as const) : ('updated' as const)
			})),
			sleep: vi.fn(async () => undefined),
			paceMs: 250
		};

		await syncBulkNicknames(deps, { includeStaff: false });
		expect(deps.sleep).toHaveBeenCalledTimes(1);
		expect(deps.sleep).toHaveBeenCalledWith(250);

		deps.sleep.mockClear();
		await syncBulkNicknames(deps, { includeStaff: false, dryRun: true });
		expect(deps.sleep).not.toHaveBeenCalled();
	});

	it('stops between targets at the deadline and reports the remaining count', async () => {
		const targets = buildTargets(['1001', '1002', '1003', '1004']);
		let clock = 0;
		const syncNickname = vi.fn(async () => {
			clock += 400;
			return { outcome: 'updated' as const };
		});

		const result = await syncBulkNicknames(
			{
				resolveTargets: async () => targets,
				listMembers: async () => new Map(targets.map((target) => [target.discordUserId, { id: target.discordUserId, currentNickname: '' }])),
				getMember: async () => null,
				syncNickname,
				sleep,
				now: () => clock,
				deadlineMs: 1_000
			},
			{ includeStaff: false }
		);

		expect(syncNickname).toHaveBeenCalledTimes(3);
		expect(result).toMatchObject({ kind: 'completed', stopReason: 'deadline', updated: 3, remaining: 1, targetCount: 4 });
	});

	it('stops after repeated long rate-limit waits and unsubscribes from rate-limit events', async () => {
		const targets = buildTargets(['1001', '1002', '1003', '1004']);
		let onWait: ((waitMs: number) => void) | undefined;
		const unsubscribe = vi.fn();
		const syncNickname = vi.fn(async () => {
			onWait?.(500);
			onWait?.(15_000);
			return { outcome: 'updated' as const };
		});

		const result = await syncBulkNicknames(
			{
				resolveTargets: async () => targets,
				listMembers: async () => new Map(targets.map((target) => [target.discordUserId, { id: target.discordUserId, currentNickname: '' }])),
				getMember: async () => null,
				syncNickname,
				sleep,
				watchRateLimits: (listener) => {
					onWait = listener;
					return unsubscribe;
				},
				maxLongRateLimitWaits: 2
			},
			{ includeStaff: false }
		);

		expect(syncNickname).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({ kind: 'completed', stopReason: 'rate_limited', remaining: 2, rateLimitWaits: 4 });
		expect(unsubscribe).toHaveBeenCalledTimes(1);
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
