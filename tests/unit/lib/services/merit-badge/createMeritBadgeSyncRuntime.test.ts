import type { Guild } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { createMeritBadgeRoleMap } from '../../../../../src/config/meritBadgeRoles';
import { meritRepository, userRepository } from '../../../../../src/integrations/prisma/repositories';
import { createMeritBadgeSyncRuntime } from '../../../../../src/lib/services/merit-badge/createMeritBadgeSyncRuntime';
import { createKeyedLock } from '../../../../../src/lib/services/merit-badge/meritBadgeMemberLock';
import { createRecentlyChangedMembers } from '../../../../../src/lib/services/merit-badge/meritBadgeRecentlyChangedMembers';

vi.mock('../../../../../src/integrations/prisma/repositories', () => ({
	meritRepository: { getUserTotalMerits: vi.fn() },
	userRepository: { get: vi.fn() }
}));

const GUILD_ID = '100000000000000000';
const MEMBER_ID = '400000000000000001';
const FERRUM_I = '200000000000000001';
const FERRUM_II = '200000000000000002';
const FERRUM_III = '200000000000000003';

const roleMap = createMeritBadgeRoleMap(
	new Map([
		[1, FERRUM_I],
		[2, FERRUM_II],
		[3, FERRUM_III]
	])
);

function createContext() {
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
	return { requestId: 'request-1', logger };
}

function fakeGuild({ cachedMember, fetchMember }: { cachedMember?: unknown; fetchMember?: ReturnType<typeof vi.fn> } = {}) {
	return {
		id: GUILD_ID,
		members: {
			cache: new Map(cachedMember ? [[MEMBER_ID, cachedMember]] : []),
			fetch: fetchMember ?? vi.fn()
		}
	} as unknown as Guild;
}

function fakeMember(roleIds: string[] = []) {
	return {
		id: MEMBER_ID,
		user: { bot: false },
		roles: {
			cache: new Map(roleIds.map((roleId) => [roleId, {}])),
			add: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined)
		}
	};
}

describe('createMeritBadgeSyncRuntime', () => {
	it('refuses any guild other than the configured one without reads or Discord calls', async () => {
		const readTotalMerits = vi.fn();
		const resolveMember = vi.fn();
		const runtime = createMeritBadgeSyncRuntime({
			guild: fakeGuild(),
			context: createContext(),
			roleMap,
			configuredGuildId: '100000000000000999',
			readTotalMerits,
			resolveMember
		});

		await expect(runtime.syncMember({ discordUserId: MEMBER_ID })).resolves.toMatchObject({
			kind: 'failed',
			stage: 'guild',
			code: 'wrong_guild'
		});
		expect(readTotalMerits).not.toHaveBeenCalled();
		expect(resolveMember).not.toHaveBeenCalled();
	});

	it('applies the badge to a cached member with the audit reason', async () => {
		const member = fakeMember();
		const runtime = createMeritBadgeSyncRuntime({
			guild: fakeGuild({ cachedMember: member }),
			context: createContext(),
			auditReason: 'Merit badge test',
			roleMap,
			configuredGuildId: GUILD_ID,
			runExclusive: createKeyedLock(),
			recentlyChangedMembers: createRecentlyChangedMembers(),
			readTotalMerits: vi.fn().mockResolvedValue(1)
		});

		await expect(runtime.syncMember({ discordUserId: MEMBER_ID })).resolves.toMatchObject({ kind: 'updated', addedRoleId: FERRUM_I });
		expect(member.roles.add).toHaveBeenCalledWith(FERRUM_I, 'Merit badge test');
	});

	it('treats only Discord "unknown member" as not found', async () => {
		const unknownMember = Object.assign(new Error('Unknown Member'), { code: 10007 });
		const notFound = createMeritBadgeSyncRuntime({
			guild: fakeGuild({ fetchMember: vi.fn().mockRejectedValue(unknownMember) }),
			context: createContext(),
			roleMap,
			configuredGuildId: GUILD_ID,
			runExclusive: createKeyedLock(),
			recentlyChangedMembers: createRecentlyChangedMembers(),
			readTotalMerits: vi.fn()
		});
		await expect(notFound.syncMember({ discordUserId: MEMBER_ID })).resolves.toMatchObject({ kind: 'member_not_found' });

		const fetchFailed = createMeritBadgeSyncRuntime({
			guild: fakeGuild({ fetchMember: vi.fn().mockRejectedValue(new Error('socket hang up')) }),
			context: createContext(),
			roleMap,
			configuredGuildId: GUILD_ID,
			runExclusive: createKeyedLock(),
			recentlyChangedMembers: createRecentlyChangedMembers(),
			readTotalMerits: vi.fn()
		});
		await expect(fetchFailed.syncMember({ discordUserId: MEMBER_ID })).resolves.toMatchObject({ kind: 'failed', stage: 'load_member' });
	});

	it('is disabled while no badge role is configured', async () => {
		const runtime = createMeritBadgeSyncRuntime({
			guild: fakeGuild(),
			context: createContext(),
			roleMap: createMeritBadgeRoleMap(new Map()),
			configuredGuildId: GUILD_ID
		});

		await expect(runtime.syncMember({ discordUserId: MEMBER_ID })).resolves.toEqual({ kind: 'disabled', discordUserId: MEMBER_ID });
	});

	it('reads the Postgres total, and 0 for a member with no User row', async () => {
		vi.mocked(userRepository.get).mockResolvedValueOnce({ id: 'db-user-1' } as never);
		vi.mocked(meritRepository.getUserTotalMerits).mockResolvedValueOnce(1);
		const member = fakeMember();
		const runtime = createMeritBadgeSyncRuntime({
			guild: fakeGuild({ cachedMember: member }),
			context: createContext(),
			roleMap,
			configuredGuildId: GUILD_ID,
			runExclusive: createKeyedLock(),
			recentlyChangedMembers: createRecentlyChangedMembers()
		});

		await expect(runtime.syncMember({ discordUserId: MEMBER_ID })).resolves.toMatchObject({ kind: 'updated', totalMerits: 1 });
		expect(userRepository.get).toHaveBeenCalledWith({ discordUserId: MEMBER_ID });
		expect(meritRepository.getUserTotalMerits).toHaveBeenCalledWith({ userDbUserId: 'db-user-1' });

		vi.mocked(userRepository.get).mockResolvedValueOnce(null);
		const memberWithBadge = fakeMember([FERRUM_I]);
		const noUserRow = createMeritBadgeSyncRuntime({
			guild: fakeGuild({ cachedMember: memberWithBadge }),
			context: createContext(),
			roleMap,
			configuredGuildId: GUILD_ID,
			runExclusive: createKeyedLock(),
			recentlyChangedMembers: createRecentlyChangedMembers()
		});
		await expect(noUserRow.syncMember({ discordUserId: MEMBER_ID })).resolves.toMatchObject({
			kind: 'updated',
			totalMerits: 0,
			removedRoleIds: [FERRUM_I]
		});
	});

	it('fetches a member it changed recently fresh, so a stale cache never leaves two badges', async () => {
		// Like discord.js, the cached member never updates after add/remove; Discord holds the live roles.
		const liveRoles = new Set([FERRUM_I]);
		const cachedMember = fakeMember([FERRUM_I]);
		const calls: string[] = [];
		const addRole = async (roleId: string) => {
			calls.push(`add:${roleId}`);
			liveRoles.add(roleId);
		};
		const removeRole = async (roleId: string) => {
			calls.push(`remove:${roleId}`);
			liveRoles.delete(roleId);
		};
		const withLiveCalls = (member: ReturnType<typeof fakeMember>) => {
			member.roles.add.mockImplementation(addRole);
			member.roles.remove.mockImplementation(removeRole);
			return member;
		};
		withLiveCalls(cachedMember);
		const fetchMember = vi.fn(async () => withLiveCalls(fakeMember([...liveRoles])));
		let clock = 0;
		const runtime = createMeritBadgeSyncRuntime({
			guild: fakeGuild({ cachedMember, fetchMember }),
			context: createContext(),
			roleMap,
			configuredGuildId: GUILD_ID,
			runExclusive: createKeyedLock(),
			recentlyChangedMembers: createRecentlyChangedMembers({ ttlMs: 60_000, now: () => clock }),
			readTotalMerits: vi.fn()
		});

		// I -> II -> I -> III before any Discord member update arrives.
		for (const total of [2, 1, 3]) {
			await runtime.syncMember({ discordUserId: MEMBER_ID, totalMeritsOverride: total });
			expect([...liveRoles]).toHaveLength(1);
		}
		expect([...liveRoles]).toEqual([FERRUM_III]);
		// Fresh reads leave the shared cache alone, so Discord's later update still reaches the listener.
		expect(fetchMember).toHaveBeenCalledWith({ user: MEMBER_ID, force: true, cache: false });

		// A hand edit within the window is seen and repaired.
		liveRoles.clear();
		await expect(runtime.syncMember({ discordUserId: MEMBER_ID, totalMeritsOverride: 3 })).resolves.toMatchObject({
			kind: 'updated',
			addedRoleId: FERRUM_III
		});

		// Once the window passes, the (now caught-up) cache is trusted again with zero Discord calls.
		cachedMember.roles.cache = new Map([[FERRUM_III, {}]]);
		clock = 60_000;
		const fetchCount = fetchMember.mock.calls.length;
		const callCount = calls.length;
		await expect(runtime.syncMember({ discordUserId: MEMBER_ID, totalMeritsOverride: 3 })).resolves.toMatchObject({ kind: 'unchanged' });
		expect(fetchMember).toHaveBeenCalledTimes(fetchCount);
		expect(calls).toHaveLength(callCount);
	});
});
