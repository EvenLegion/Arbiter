import { getMeritRankSymbol, resolveMeritRankLevel } from '@arbiter/domain';
import { describe, expect, it, vi } from 'vitest';

import { createDirectoryService } from '../src/directory/service';
import type { DirectoryRepository, DirectoryRepositoryQuery, DirectoryRepositoryResult } from '../src/directory/types';

function createRepository(result: DirectoryRepositoryResult) {
	const query = vi.fn<(input: DirectoryRepositoryQuery) => Promise<DirectoryRepositoryResult>>().mockResolvedValue(result);
	return { repository: { query } satisfies DirectoryRepository, query };
}

describe('API directory service', () => {
	it('validates, normalizes, and composes every filter category for the repository', async () => {
		const { repository, query } = createRepository({ rows: [], unknownDivisionCodes: [] });
		const service = createDirectoryService(repository);

		await expect(
			service.query({
				discordUserIds: ['100000000000000001', '100000000000000001', '100000000000000002'],
				divisionCodesAny: ['LGN', 'LGN', 'RES'],
				exactRank: 3,
				minimumRank: 2,
				maximumRank: 4,
				limit: 25
			})
		).resolves.toEqual({ ok: true, value: { users: [], nextCursor: null } });
		expect(query).toHaveBeenCalledWith({
			discordUserIds: ['100000000000000001', '100000000000000002'],
			divisionCodesAny: ['LGN', 'RES'],
			exactRank: 3,
			minimumRank: 2,
			maximumRank: 4,
			limit: 26
		});
	});

	it('uses canonical rank output for null, threshold, and maximum-rank totals regardless of memberships', async () => {
		const totals = [-5, 0, 1, 7, 1323, 9999];
		const rows = totals.map((totalMerits, index) => ({
			discordUserId: `1000000000000000${index + 1}`,
			memberships: [{ divisionCode: 'LGN', divisionName: 'Legionnaire', divisionKind: 'LEGIONNAIRE' as const }],
			totalMerits,
			rankLevel: resolveMeritRankLevel(totalMerits)
		}));
		const { repository } = createRepository({ rows, unknownDivisionCodes: [] });

		const result = await createDirectoryService(repository).query({ limit: 100 });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.users.map(({ rankLevel }) => rankLevel)).toEqual([null, null, 1, 3, 50, 50]);
		expect(result.value.users.map(({ rankSymbol }) => rankSymbol)).toEqual([
			null,
			null,
			getMeritRankSymbol(1),
			getMeritRankSymbol(3),
			getMeritRankSymbol(50),
			getMeritRankSymbol(50)
		]);
	});

	it('emits stable opaque cursors and rejects malformed, non-canonical, and out-of-policy inputs', async () => {
		const firstRows = ['100000000000000001', '100000000000000002', '100000000000000003'].map((discordUserId) => ({
			discordUserId,
			memberships: [],
			totalMerits: 0,
			rankLevel: null
		}));
		const first = createRepository({ rows: firstRows, unknownDivisionCodes: [] });
		const firstResult = await createDirectoryService(first.repository).query({ limit: 2 });
		expect(firstResult.ok).toBe(true);
		if (!firstResult.ok || !firstResult.value.nextCursor) return;
		expect(firstResult.value.nextCursor).not.toContain('100000000000000002');

		const second = createRepository({ rows: [], unknownDivisionCodes: [] });
		await expect(createDirectoryService(second.repository).query({ limit: 2, cursor: firstResult.value.nextCursor })).resolves.toEqual({
			ok: true,
			value: { users: [], nextCursor: null }
		});
		expect(second.query).toHaveBeenCalledWith({ limit: 3, afterDiscordUserId: '100000000000000002' });

		await expect(createDirectoryService(second.repository).query({ cursor: 'bm90LWpzb24' })).resolves.toEqual({
			ok: false,
			error: { code: 'invalid_input' }
		});
		await expect(createDirectoryService(second.repository).query({ minimumRank: 4, maximumRank: 3 })).resolves.toEqual({
			ok: false,
			error: { code: 'invalid_input' }
		});
		await expect(createDirectoryService(second.repository).query({ exactRank: 51 })).resolves.toEqual({
			ok: false,
			error: { code: 'invalid_input' }
		});
	});

	it('fails unknown division codes and detects repository rank-policy drift', async () => {
		const unknown = createRepository({ rows: [], unknownDivisionCodes: ['UNKNOWN'] });
		await expect(createDirectoryService(unknown.repository).query({ divisionCodesAny: ['UNKNOWN'] })).resolves.toEqual({
			ok: false,
			error: { code: 'unknown_divisions', divisionCodes: ['UNKNOWN'] }
		});

		const drifted = createRepository({
			rows: [{ discordUserId: '100000000000000001', memberships: [], totalMerits: 7, rankLevel: 2 }],
			unknownDivisionCodes: []
		});
		await expect(createDirectoryService(drifted.repository).query({})).rejects.toThrow('rank policy drift');
	});
});
