import { describe, expect, it, vi } from 'vitest';

import { createMeritBadgeRoleMap, type MeritBadgeRoleMap } from '../../../../../src/config/meritBadgeRoles';
import {
	buildMeritBadgeCutoverReport,
	checkMeritBadgeLiveRunReadiness,
	createMeritBadgeBulkRunLock,
	runMeritBadgeBulkSync,
	type MeritBadgeBulkSyncDeps,
	type MeritBadgeStoredTotal
} from '../../../../../src/lib/services/merit-badge/meritBadgeBulkSyncService';
import { createKeyedLock } from '../../../../../src/lib/services/merit-badge/meritBadgeMemberLock';
import type { MeritBadgeRoleChangeResult } from '../../../../../src/lib/services/merit-badge/meritBadgeRoleGateway';
import { syncMemberMeritBadge } from '../../../../../src/lib/services/merit-badge/meritBadgeSyncService';

const FERRUM_I = '200000000000000001';
const FERRUM_II = '200000000000000002';
const AES_I = '200000000000000004';
const OBSIANUS_III = '200000000000000027';
const OTHER_ROLE = '300000000000000001';

const configuredRoleMap = createMeritBadgeRoleMap(
	new Map([
		[1, FERRUM_I],
		[2, FERRUM_II],
		[4, AES_I],
		[27, OBSIANUS_III]
	])
);
const emptyRoleMap = createMeritBadgeRoleMap(new Map());

function memberId(index: number) {
	return `4000000000000000${String(index).padStart(2, '0')}`;
}

function createLogger() {
	const logger = {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: vi.fn()
	};
	logger.child.mockReturnValue(logger);
	return logger;
}

type WorldMember = { roles: Set<string>; bot?: boolean; total?: number; username?: string; noUserRow?: boolean };

/**
 * A fake guild and database. `syncMember` runs the real single-member service against it, so role
 * changes stick between runs.
 */
function createWorld(initial: Record<string, WorldMember>, { roleMap = configuredRoleMap }: { roleMap?: MeritBadgeRoleMap } = {}) {
	const members = new Map(Object.entries(initial));
	const roleCalls: string[] = [];
	const failRoleCallsFor = new Set<string>();
	const logger = createLogger();

	const readTotals = vi.fn(async (ids: readonly string[]) => {
		const totals = new Map<string, MeritBadgeStoredTotal>();
		for (const id of ids) {
			const member = members.get(id);
			if (member && !member.noUserRow) {
				totals.set(id, { totalMerits: member.total ?? 0, storedUsername: member.username ?? `user-${id.slice(-2)}` });
			}
		}
		return totals;
	});

	const changeRole = (kind: 'add' | 'remove') => async (member: { id: string; roles: Set<string> }, roleId: string) => {
		roleCalls.push(`${kind}:${member.id}:${roleId}`);
		if (failRoleCallsFor.has(member.id)) {
			return { ok: false, code: 'missing_permissions' } satisfies MeritBadgeRoleChangeResult;
		}
		if (kind === 'add') {
			member.roles.add(roleId);
		} else {
			member.roles.delete(roleId);
		}
		return { ok: true } satisfies MeritBadgeRoleChangeResult;
	};

	const syncMember = vi.fn((discordUserId: string) =>
		syncMemberMeritBadge(
			{
				roleMap,
				runExclusive: createKeyedLock(),
				logger,
				getMember: async (id) => {
					const member = members.get(id);
					return member ? { id, roles: member.roles, bot: Boolean(member.bot) } : null;
				},
				describeMember: (member) => ({ isBot: member.bot, roleIds: member.roles }),
				readTotalMerits: async (id) => (members.get(id)?.noUserRow ? 0 : (members.get(id)?.total ?? 0)),
				addRole: changeRole('add'),
				removeRole: changeRole('remove')
			},
			{ discordUserId }
		)
	);

	const deps = {
		roleMap,
		logger,
		listMembers: vi.fn(async ({ requestedDiscordUserId }: { requestedDiscordUserId?: string }) =>
			[...members.entries()]
				.filter(([id]) => !requestedDiscordUserId || id === requestedDiscordUserId)
				.map(([id, member]) => ({ discordUserId: id, isBot: Boolean(member.bot), roleIds: [...member.roles] }))
		),
		readTotals,
		syncMember,
		watchRateLimits: vi.fn(() => () => undefined),
		sleep: vi.fn(async () => undefined),
		now: () => 0
	} satisfies MeritBadgeBulkSyncDeps;

	return { members, deps, roleCalls, failRoleCallsFor };
}

describe('buildMeritBadgeCutoverReport', () => {
	it('works with no role IDs configured, makes no role calls and shows the top member as Obsianus III', async () => {
		const world = createWorld(
			{
				[memberId(2)]: { roles: new Set([OTHER_ROLE]), total: 599, username: 'top.member' },
				[memberId(1)]: { roles: new Set(), total: 0 },
				[memberId(3)]: { roles: new Set(), bot: true, total: 50 }
			},
			{ roleMap: emptyRoleMap }
		);

		const report = await buildMeritBadgeCutoverReport(world.deps);

		expect(world.roleCalls).toEqual([]);
		expect(world.deps.syncMember).not.toHaveBeenCalled();
		expect(report.kind).toBe('report');
		if (report.kind !== 'report') return;
		expect(report.rows.map((row) => row.discordUserId)).toEqual([memberId(1), memberId(2)]);
		const top = report.rows[1];
		expect(top).toMatchObject({
			storedUsername: 'top.member',
			totalMerits: 599,
			legacyLevel: 33,
			legacySymbol: '㉝',
			desiredRoleConfigured: false,
			currentTiers: [],
			action: 'unconfigured'
		});
		expect(top.desiredTier?.label).toBe('Obsianus III');
		expect(report.rows[0]).toMatchObject({ desiredTier: null, legacyLevel: null, legacySymbol: null, action: 'none' });
		expect(report.histogram.map(({ tier, count }) => [tier.label, count])).toEqual([['Obsianus III', 1]]);
		expect(report.noBadgeCount).toBe(1);
		expect(report.actionCounts).toEqual({ add: 0, swap: 0, remove: 0, none: 1, unconfigured: 1 });
	});

	it('plans add, swap, remove, none and unconfigured from current badge roles', async () => {
		const world = createWorld({
			[memberId(1)]: { roles: new Set(), total: 1 },
			[memberId(2)]: { roles: new Set([FERRUM_I]), total: 2 },
			[memberId(3)]: { roles: new Set([FERRUM_II]), noUserRow: true },
			[memberId(4)]: { roles: new Set([FERRUM_II]), total: 2 },
			[memberId(5)]: { roles: new Set([FERRUM_II]), total: 3 }
		});

		const report = await buildMeritBadgeCutoverReport(world.deps);

		expect(report.kind).toBe('report');
		if (report.kind !== 'report') return;
		expect(report.rows.map((row) => row.action)).toEqual(['add', 'swap', 'remove', 'none', 'unconfigured']);
		expect(report.rows[2]).toMatchObject({
			storedUsername: null,
			totalMerits: 0,
			currentTiers: [expect.objectContaining({ label: 'Ferrum II' })]
		});
		expect(world.roleCalls).toEqual([]);
	});

	it('fails the whole report when a totals read fails', async () => {
		const world = createWorld({ [memberId(1)]: { roles: new Set(), total: 5 } });
		world.deps.readTotals.mockRejectedValueOnce(new Error('db down'));

		await expect(buildMeritBadgeCutoverReport(world.deps)).resolves.toEqual({ kind: 'read_failed' });
	});

	it('reports no members when the requested user is missing or a bot', async () => {
		const world = createWorld({ [memberId(1)]: { roles: new Set(), bot: true } });

		await expect(buildMeritBadgeCutoverReport(world.deps, { requestedDiscordUserId: memberId(1) })).resolves.toEqual({ kind: 'no_members' });
		await expect(buildMeritBadgeCutoverReport(world.deps, { requestedDiscordUserId: memberId(9) })).resolves.toEqual({ kind: 'no_members' });
	});
});

describe('runMeritBadgeBulkSync', () => {
	it('applies badges, then a rerun converges to updated 0 and failed 0 with zero role calls', async () => {
		const world = createWorld({
			[memberId(1)]: { roles: new Set(), total: 1 },
			[memberId(2)]: { roles: new Set([FERRUM_I]), total: 5 },
			[memberId(3)]: { roles: new Set([FERRUM_II, OTHER_ROLE]), total: 0 },
			[memberId(4)]: { roles: new Set([FERRUM_II]), total: 2 }
		});

		const first = await runMeritBadgeBulkSync(world.deps);

		expect(first).toMatchObject({
			kind: 'completed',
			stopReason: null,
			targetCount: 4,
			processed: 4,
			remaining: 0,
			updated: 3,
			unchanged: 1,
			failed: 0
		});
		expect([...world.members.get(memberId(2))!.roles]).toEqual([AES_I]);
		expect([...world.members.get(memberId(3))!.roles]).toEqual([OTHER_ROLE]);
		// The correct member never entered the single-member sync.
		expect(world.deps.syncMember).not.toHaveBeenCalledWith(memberId(4));

		world.roleCalls.length = 0;
		world.deps.syncMember.mockClear();
		const rerun = await runMeritBadgeBulkSync(world.deps);

		expect(rerun).toMatchObject({ kind: 'completed', updated: 0, failed: 0, unchanged: 4 });
		expect(world.roleCalls).toEqual([]);
		expect(world.deps.syncMember).not.toHaveBeenCalled();
	});

	it('counts every member of a chunk whose totals read fails as failed, with no role calls', async () => {
		const world = createWorld({
			[memberId(1)]: { roles: new Set([FERRUM_II]), total: 2 },
			[memberId(2)]: { roles: new Set([AES_I]), total: 5 },
			[memberId(3)]: { roles: new Set(), total: 1 }
		});
		world.deps.readTotals.mockRejectedValueOnce(new Error('db down'));

		const result = await runMeritBadgeBulkSync({ ...world.deps, chunkSize: 2 });

		expect(result).toMatchObject({ kind: 'completed', processed: 3, failed: 2, readFailed: 2, updated: 1 });
		expect(world.roleCalls).toEqual([`add:${memberId(3)}:${FERRUM_I}`]);
		expect([...world.members.get(memberId(1))!.roles]).toEqual([FERRUM_II]);
		expect([...world.members.get(memberId(2))!.roles]).toEqual([AES_I]);
	});

	it('re-reads the total inside the member sync, so a newer award is not undone by the chunk total', async () => {
		const world = createWorld({ [memberId(1)]: { roles: new Set([FERRUM_I]), total: 1 } });
		// The chunk read is older than an award that lands before the member is synced.
		world.deps.readTotals.mockResolvedValueOnce(new Map([[memberId(1), { totalMerits: 0, storedUsername: 'u' }]]));

		const result = await runMeritBadgeBulkSync(world.deps);

		expect(result).toMatchObject({ unchanged: 1, updated: 0 });
		expect(world.roleCalls).toEqual([]);
	});

	it('stops at the deadline between members with processed and remaining counts', async () => {
		const world = createWorld({
			[memberId(1)]: { roles: new Set(), total: 1 },
			[memberId(2)]: { roles: new Set(), total: 1 },
			[memberId(3)]: { roles: new Set(), total: 1 }
		});
		let clock = 0;
		const deps = {
			...world.deps,
			now: () => clock,
			deadlineMs: 1_000,
			sleep: vi.fn(async (ms: number) => {
				clock += ms;
			}),
			paceMs: 600
		};

		const result = await runMeritBadgeBulkSync(deps);

		expect(result).toMatchObject({ kind: 'partial', stopReason: 'deadline', processed: 2, remaining: 1, updated: 2 });
		expect(world.members.get(memberId(3))!.roles.size).toBe(0);
	});

	it('pauses after each member whose sync made role calls, but not after no-ops or the last member', async () => {
		const world = createWorld({
			[memberId(1)]: { roles: new Set(), total: 1 },
			[memberId(2)]: { roles: new Set([FERRUM_I]), total: 1 },
			[memberId(3)]: { roles: new Set([FERRUM_I]), total: 2 },
			[memberId(4)]: { roles: new Set(), total: 1 }
		});
		world.failRoleCallsFor.add(memberId(3));

		const result = await runMeritBadgeBulkSync({ ...world.deps, paceMs: 250 });

		expect(result).toMatchObject({ updated: 2, unchanged: 1, failed: 1 });
		// After member 1 (updated) and member 3 (failed add); none after the no-op or the last member.
		expect(world.deps.sleep.mock.calls).toEqual([[250], [250]]);
	});

	it('counts rate-limit waits and stops cleanly after repeated long waits', async () => {
		const world = createWorld({
			[memberId(1)]: { roles: new Set(), total: 1 },
			[memberId(2)]: { roles: new Set(), total: 1 },
			[memberId(3)]: { roles: new Set(), total: 1 },
			[memberId(4)]: { roles: new Set(), total: 1 }
		});
		let emitWait: (waitMs: number) => void = () => undefined;
		const unsubscribe = vi.fn();
		const waits = [500, 15_000, 20_000];
		const deps = {
			...world.deps,
			watchRateLimits: vi.fn((onWait: (waitMs: number) => void) => {
				emitWait = onWait;
				return unsubscribe;
			}),
			// Simulated waits arrive while members are paced.
			sleep: vi.fn(async () => {
				const next = waits.shift();
				if (next !== undefined) emitWait(next);
			}),
			maxLongRateLimitWaits: 2
		};

		const result = await runMeritBadgeBulkSync(deps);

		expect(result).toMatchObject({
			kind: 'partial',
			stopReason: 'rate_limited',
			processed: 3,
			remaining: 1,
			rateLimitWaits: 3,
			longRateLimitWaits: 2
		});
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(world.deps.logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ waitMs: 15_000, isLong: true }),
			'merit_badge.bulk_sync.rate_limited'
		);
	});

	it('syncs only the requested member', async () => {
		const world = createWorld({
			[memberId(1)]: { roles: new Set(), total: 1 },
			[memberId(2)]: { roles: new Set(), total: 1 }
		});

		const result = await runMeritBadgeBulkSync(world.deps, { requestedDiscordUserId: memberId(2) });

		expect(result).toMatchObject({ targetCount: 1, updated: 1 });
		expect(world.roleCalls).toEqual([`add:${memberId(2)}:${FERRUM_I}`]);
	});
});

describe('checkMeritBadgeLiveRunReadiness', () => {
	it('requires configured roles, Manage Roles and every badge role editable', () => {
		const allEditable = new Set(configuredRoleMap.roleIds);

		expect(checkMeritBadgeLiveRunReadiness({ roleMap: emptyRoleMap, botHasManageRoles: true, editableRoleIds: allEditable })).toEqual({
			ok: false,
			reason: 'not_configured'
		});
		expect(checkMeritBadgeLiveRunReadiness({ roleMap: configuredRoleMap, botHasManageRoles: false, editableRoleIds: allEditable })).toEqual({
			ok: false,
			reason: 'missing_manage_roles'
		});
		expect(
			checkMeritBadgeLiveRunReadiness({ roleMap: configuredRoleMap, botHasManageRoles: true, editableRoleIds: new Set([FERRUM_I, FERRUM_II]) })
		).toEqual({ ok: false, reason: 'roles_not_editable', tierLabels: ['Aes I', 'Obsianus III'] });
		expect(checkMeritBadgeLiveRunReadiness({ roleMap: configuredRoleMap, botHasManageRoles: true, editableRoleIds: allEditable })).toEqual({
			ok: true
		});
	});
});

describe('createMeritBadgeBulkRunLock', () => {
	it('allows one live run at a time', () => {
		const lock = createMeritBadgeBulkRunLock();

		const release = lock.tryAcquire();
		expect(release).not.toBeNull();
		expect(lock.tryAcquire()).toBeNull();

		release!();
		release!();
		const next = lock.tryAcquire();
		expect(next).not.toBeNull();
		expect(lock.tryAcquire()).toBeNull();
	});
});
