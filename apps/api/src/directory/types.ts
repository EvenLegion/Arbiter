import type { ApiDirectoryMembership, ApiDirectoryPage, ApiDirectoryQueryInput } from '@arbiter/api-contracts';

export type DirectoryRepositoryQuery = {
	discordUserIds?: string[];
	divisionCodesAny?: string[];
	exactRank?: number;
	minimumRank?: number;
	maximumRank?: number;
	limit: number;
	afterDiscordUserId?: string;
};

export type DirectoryRepositoryRow = {
	discordUserId: string;
	memberships: ApiDirectoryMembership[];
	totalMerits: number;
	rankLevel: number | null;
};

export type DirectoryRepositoryResult = {
	rows: DirectoryRepositoryRow[];
	unknownDivisionCodes: string[];
};

export type DirectoryRepository = {
	query: (input: DirectoryRepositoryQuery, signal?: AbortSignal, deadlineAtMs?: number) => Promise<DirectoryRepositoryResult>;
};

export type DirectoryServiceError = { code: 'invalid_input' } | { code: 'unknown_divisions'; divisionCodes: string[] };

export type DirectoryServiceResult = { ok: true; value: ApiDirectoryPage } | { ok: false; error: DirectoryServiceError };

export type DirectoryService = {
	query: (input: ApiDirectoryQueryInput, signal?: AbortSignal, deadlineAtMs?: number) => Promise<DirectoryServiceResult>;
};
