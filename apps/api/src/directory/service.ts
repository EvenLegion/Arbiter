import { API_DIRECTORY_MAX_BATCH_SIZE, ApiDirectoryQuerySchema } from '@arbiter/api-contracts';
import { MAX_MERIT_RANK_LEVEL, getMeritRankSymbol, resolveMeritRankLevel } from '@arbiter/domain';

import type { DirectoryRepository, DirectoryRepositoryQuery, DirectoryService } from './types';

const CURSOR_VERSION = 1;

type DirectoryCursor = {
	v: typeof CURSOR_VERSION;
	afterDiscordUserId: string;
};

export function createDirectoryService(repository: DirectoryRepository): DirectoryService {
	return {
		query: async (input, signal) => {
			signal?.throwIfAborted();
			const parsed = ApiDirectoryQuerySchema.safeParse(input);
			if (!parsed.success || !hasValidRankBounds(parsed.data)) return { ok: false, error: { code: 'invalid_input' } };

			const afterDiscordUserId = parsed.data.cursor ? decodeDirectoryCursor(parsed.data.cursor) : undefined;
			if (parsed.data.cursor && !afterDiscordUserId) return { ok: false, error: { code: 'invalid_input' } };

			const repositoryQuery: DirectoryRepositoryQuery = {
				limit: parsed.data.limit + 1
			};
			const discordUserIds = unique(parsed.data.discordUserIds);
			const divisionCodesAny = unique(parsed.data.divisionCodesAny);
			if (discordUserIds) repositoryQuery.discordUserIds = discordUserIds;
			if (divisionCodesAny) repositoryQuery.divisionCodesAny = divisionCodesAny;
			if (parsed.data.exactRank !== undefined) repositoryQuery.exactRank = parsed.data.exactRank;
			if (parsed.data.minimumRank !== undefined) repositoryQuery.minimumRank = parsed.data.minimumRank;
			if (parsed.data.maximumRank !== undefined) repositoryQuery.maximumRank = parsed.data.maximumRank;
			if (afterDiscordUserId) repositoryQuery.afterDiscordUserId = afterDiscordUserId;

			const result = signal ? await repository.query(repositoryQuery, signal) : await repository.query(repositoryQuery);
			signal?.throwIfAborted();
			if (result.unknownDivisionCodes.length > 0) {
				return { ok: false, error: { code: 'unknown_divisions', divisionCodes: result.unknownDivisionCodes } };
			}

			const hasNextPage = result.rows.length > parsed.data.limit;
			const pageRows = result.rows.slice(0, parsed.data.limit);
			const users = pageRows.map((row) => {
				const rankLevel = resolveMeritRankLevel(row.totalMerits);
				if (rankLevel !== row.rankLevel) throw new Error('Directory repository rank policy drift detected');
				return {
					discordUserId: row.discordUserId,
					memberships: row.memberships,
					totalMerits: row.totalMerits,
					rankLevel,
					rankSymbol: rankLevel === null ? null : getMeritRankSymbol(rankLevel)
				};
			});
			const lastUser = pageRows.at(-1);

			return {
				ok: true,
				value: {
					users,
					nextCursor: hasNextPage && lastUser ? encodeDirectoryCursor(lastUser.discordUserId) : null
				}
			};
		}
	};
}

function hasValidRankBounds(input: { exactRank?: number; minimumRank?: number; maximumRank?: number }): boolean {
	return [input.exactRank, input.minimumRank, input.maximumRank].every((rank) => rank === undefined || (rank >= 1 && rank <= MAX_MERIT_RANK_LEVEL));
}

function unique(values: string[] | undefined): string[] | undefined {
	return values ? [...new Set(values)] : undefined;
}

function encodeDirectoryCursor(afterDiscordUserId: string): string {
	const cursor: DirectoryCursor = { v: CURSOR_VERSION, afterDiscordUserId };
	return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeDirectoryCursor(value: string): string | null {
	try {
		const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
		if (!isDirectoryCursor(decoded)) return null;
		const canonical = encodeDirectoryCursor(decoded.afterDiscordUserId);
		return canonical === value ? decoded.afterDiscordUserId : null;
	} catch {
		return null;
	}
}

function isDirectoryCursor(value: unknown): value is DirectoryCursor {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	return (
		Object.keys(record).length === 2 &&
		record.v === CURSOR_VERSION &&
		typeof record.afterDiscordUserId === 'string' &&
		/^\d{17,20}$/.test(record.afterDiscordUserId)
	);
}

export const DIRECTORY_MAX_PAGE_SIZE = API_DIRECTORY_MAX_BATCH_SIZE;
