import { describe, expect, it, vi } from 'vitest';

import { createMeritBadgeRoleMap } from '../../../../../src/config/meritBadgeRoles';
import { createKeyedLock } from '../../../../../src/lib/services/merit-badge/meritBadgeMemberLock';
import type { MeritBadgeRoleChangeResult } from '../../../../../src/lib/services/merit-badge/meritBadgeRoleGateway';
import { syncMemberMeritBadge, type MeritBadgeSyncDeps } from '../../../../../src/lib/services/merit-badge/meritBadgeSyncService';

const MEMBER_ID = '400000000000000001';
const FERRUM_I = '200000000000000001';
const FERRUM_II = '200000000000000002';
const AES_I = '200000000000000004';
const STAFF_ROLE = '300000000000000001';

const roleMap = createMeritBadgeRoleMap(
	new Map([
		[1, FERRUM_I],
		[2, FERRUM_II],
		[4, AES_I]
	])
);

type FakeMember = { id: string; bot: boolean; roles: Set<string> };

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

function setup({
	member = { id: MEMBER_ID, bot: false, roles: new Set<string>() } as FakeMember | null,
	total = 0,
	addResult = { ok: true } as MeritBadgeRoleChangeResult,
	removeResults = [] as MeritBadgeRoleChangeResult[],
	map = roleMap
} = {}) {
	const calls: string[] = [];
	const removeQueue = [...removeResults];
	const deps = {
		roleMap: map,
		runExclusive: createKeyedLock(),
		logger: createLogger(),
		getMember: vi.fn(async () => member),
		describeMember: (target: FakeMember) => ({ isBot: target.bot, roleIds: target.roles }),
		readTotalMerits: vi.fn(async () => total),
		addRole: vi.fn(async (target: FakeMember, roleId: string) => {
			calls.push(`add:${roleId}`);
			if (addResult.ok) {
				target.roles.add(roleId);
			}
			return addResult;
		}),
		removeRole: vi.fn(async (target: FakeMember, roleId: string) => {
			calls.push(`remove:${roleId}`);
			const result = removeQueue.shift() ?? { ok: true };
			if (result.ok) {
				target.roles.delete(roleId);
			}
			return result;
		})
	} satisfies MeritBadgeSyncDeps<FakeMember>;

	return { deps, calls, member };
}

function badgeRolesOf(member: FakeMember | null) {
	return [...(member?.roles ?? [])].filter((roleId) => roleMap.roleIds.has(roleId));
}

describe('syncMemberMeritBadge', () => {
	it('is disabled with no reads or Discord calls while no badge role is configured', async () => {
		const { deps, calls } = setup({ map: createMeritBadgeRoleMap(new Map()), total: 50 });

		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID })).resolves.toEqual({ kind: 'disabled', discordUserId: MEMBER_ID });
		expect(deps.getMember).not.toHaveBeenCalled();
		expect(deps.readTotalMerits).not.toHaveBeenCalled();
		expect(calls).toEqual([]);
	});

	it('makes zero Discord calls when the member already holds the right badge', async () => {
		const { deps, calls } = setup({ member: { id: MEMBER_ID, bot: false, roles: new Set([AES_I]) }, total: 6 });

		const result = await syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID });

		expect(result.kind).toBe('unchanged');
		expect(calls).toEqual([]);
	});

	it('adds the new badge before removing the old one', async () => {
		const { deps, calls, member } = setup({ member: { id: MEMBER_ID, bot: false, roles: new Set([FERRUM_II]) }, total: 5 });

		const result = await syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID });

		expect(result).toMatchObject({ kind: 'updated', addedRoleId: AES_I, removedRoleIds: [FERRUM_II] });
		expect(calls).toEqual([`add:${AES_I}`, `remove:${FERRUM_II}`]);
		expect(badgeRolesOf(member)).toEqual([AES_I]);
	});

	it('cleans up duplicate badge roles so the member holds one', async () => {
		const { deps, calls, member } = setup({
			member: { id: MEMBER_ID, bot: false, roles: new Set([FERRUM_I, FERRUM_II, AES_I, STAFF_ROLE]) },
			total: 2
		});

		const result = await syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID });

		expect(result).toMatchObject({ kind: 'updated', addedRoleId: null, removedRoleIds: [FERRUM_I, AES_I] });
		expect(calls).toEqual([`remove:${FERRUM_I}`, `remove:${AES_I}`]);
		expect([...(member?.roles ?? [])]).toEqual([FERRUM_II, STAFF_ROLE]);
	});

	it('removes every badge from a member under 1 merit', async () => {
		const { deps, member } = setup({ member: { id: MEMBER_ID, bot: false, roles: new Set([FERRUM_I]) }, total: 0 });

		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID })).resolves.toMatchObject({
			kind: 'updated',
			addedRoleId: null,
			removedRoleIds: [FERRUM_I]
		});
		expect(badgeRolesOf(member)).toEqual([]);
	});

	it('drops one section after a demerit (D1)', async () => {
		const { deps, member } = setup({ member: { id: MEMBER_ID, bot: false, roles: new Set([AES_I]) }, total: 4 });

		const result = await syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID });

		// 4 merits is Ferrum III, which is unconfigured here, so Ferrum II applies.
		expect(result).toMatchObject({ kind: 'updated', addedRoleId: FERRUM_II, removedRoleIds: [AES_I] });
		expect(badgeRolesOf(member)).toEqual([FERRUM_II]);
		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ desiredTier: 3, appliedTier: 2, tierRoleMissing: true }),
			'merit_badge.sync.tier_role_missing'
		);
	});

	it('skips bots without reading their total or touching roles', async () => {
		const { deps, calls } = setup({ member: { id: MEMBER_ID, bot: true, roles: new Set([FERRUM_I]) }, total: 50 });

		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID })).resolves.toEqual({ kind: 'skipped_bot', discordUserId: MEMBER_ID });
		expect(deps.readTotalMerits).not.toHaveBeenCalled();
		expect(calls).toEqual([]);
	});

	it('includes staff members (D3)', async () => {
		const { deps, calls } = setup({ member: { id: MEMBER_ID, bot: false, roles: new Set([STAFF_ROLE]) }, total: 1 });

		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID })).resolves.toMatchObject({ kind: 'updated', addedRoleId: FERRUM_I });
		expect(calls).toEqual([`add:${FERRUM_I}`]);
	});

	it('reports a member who is not in the guild', async () => {
		const { deps } = setup({ member: null });

		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID })).resolves.toEqual({
			kind: 'member_not_found',
			discordUserId: MEMBER_ID
		});
		expect(deps.readTotalMerits).not.toHaveBeenCalled();
	});

	it('uses the total override instead of reading again', async () => {
		const { deps } = setup({ total: 0 });

		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID, totalMeritsOverride: 5 })).resolves.toMatchObject({
			kind: 'updated',
			totalMerits: 5,
			addedRoleId: AES_I
		});
		expect(deps.readTotalMerits).not.toHaveBeenCalled();
	});

	it('keeps the old badge when the add fails', async () => {
		const { deps, calls, member } = setup({
			member: { id: MEMBER_ID, bot: false, roles: new Set([FERRUM_I]) },
			total: 5,
			addResult: { ok: false, code: 'missing_permissions', discordErrorCode: 50013 }
		});

		const result = await syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID });

		expect(result).toMatchObject({ kind: 'failed', stage: 'add_role', code: 'missing_permissions', addedRoleId: null, removedRoleIds: [] });
		expect(calls).toEqual([`add:${AES_I}`]);
		expect(badgeRolesOf(member)).toEqual([FERRUM_I]);
	});

	it('reports partial success when a removal fails after the add', async () => {
		const { deps } = setup({
			member: { id: MEMBER_ID, bot: false, roles: new Set([FERRUM_I, FERRUM_II]) },
			total: 5,
			removeResults: [{ ok: true }, { ok: false, code: 'unknown_role', discordErrorCode: 10011 }]
		});

		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID })).resolves.toMatchObject({
			kind: 'failed',
			stage: 'remove_role',
			code: 'unknown_role',
			addedRoleId: AES_I,
			removedRoleIds: [FERRUM_I]
		});
	});

	it('never strips badges when the total read fails', async () => {
		const { deps, calls } = setup({ member: { id: MEMBER_ID, bot: false, roles: new Set([AES_I]) } });
		deps.readTotalMerits.mockRejectedValueOnce(new Error('database down'));

		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID })).resolves.toMatchObject({
			kind: 'failed',
			stage: 'read_total',
			code: 'read_failed'
		});
		expect(calls).toEqual([]);
	});

	it('fails instead of stripping badges on a non-finite total', async () => {
		const { deps, calls } = setup({ member: { id: MEMBER_ID, bot: false, roles: new Set([AES_I]) } });

		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID, totalMeritsOverride: Number.NaN })).resolves.toMatchObject({
			kind: 'failed',
			stage: 'read_total',
			code: 'invalid_total'
		});
		expect(calls).toEqual([]);
	});

	it('never throws when a dependency throws', async () => {
		const { deps } = setup({ total: 5 });
		deps.getMember.mockRejectedValueOnce(new Error('gateway down'));
		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID })).resolves.toMatchObject({ kind: 'failed', stage: 'load_member' });

		deps.addRole.mockRejectedValueOnce(new Error('unexpected'));
		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID })).resolves.toMatchObject({ kind: 'failed', stage: 'unexpected' });

		deps.logger.info.mockImplementation(() => {
			throw new Error('logger broken');
		});
		await expect(syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID })).resolves.toMatchObject({ kind: 'updated' });
	});

	it('runs two syncs for the same member one after the other', async () => {
		const { deps, calls } = setup({ total: 5 });
		let releaseFirstAdd!: () => void;
		deps.addRole.mockImplementationOnce(async (target: FakeMember, roleId: string) => {
			calls.push(`add-start:${roleId}`);
			await new Promise<void>((resolve) => {
				releaseFirstAdd = resolve;
			});
			target.roles.add(roleId);
			calls.push(`add-end:${roleId}`);
			return { ok: true };
		});

		const first = syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID });
		const second = syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID });
		await vi.waitFor(() => expect(calls).toEqual([`add-start:${AES_I}`]));
		releaseFirstAdd();

		await expect(first).resolves.toMatchObject({ kind: 'updated' });
		// The second sync saw the first one's result, so it had nothing to do.
		await expect(second).resolves.toMatchObject({ kind: 'unchanged' });
		expect(calls).toEqual([`add-start:${AES_I}`, `add-end:${AES_I}`]);
	});

	it('logs IDs, tiers and the outcome only', async () => {
		const { deps } = setup({ member: { id: MEMBER_ID, bot: false, roles: new Set([FERRUM_I]) }, total: 5 });

		await syncMemberMeritBadge(deps, { discordUserId: MEMBER_ID });

		expect(deps.logger.info).toHaveBeenCalledWith(
			{
				discordUserId: MEMBER_ID,
				outcome: 'updated',
				desiredTier: 4,
				appliedTier: 4,
				previousTier: 1,
				tierRoleMissing: false,
				addedRoleId: AES_I,
				removedRoleIds: [FERRUM_I]
			},
			'merit_badge.sync.completed'
		);
	});
});
