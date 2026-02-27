import type { DivisionKind } from '@prisma/client';
import { getDivisionCacheState } from './initDivisionCache';

type DivisionQueryParams = {
	ids?: number[];
	codes?: string[];
	kinds?: DivisionKind[];
	requireEmoji?: boolean;
};

export async function getCachedDivisions({ ids, codes, kinds, requireEmoji = false }: DivisionQueryParams = {}) {
	const cache = await getDivisionCacheState();

	const idFilter = ids && ids.length > 0 ? new Set(ids) : null;
	const codeFilter = codes && codes.length > 0 ? new Set(codes.map((code) => code.toUpperCase())) : null;
	const kindFilter = kinds && kinds.length > 0 ? new Set(kinds) : null;

	return cache?.divisions.filter((division) => {
		if (idFilter && !idFilter.has(division.id)) {
			return false;
		}

		if (codeFilter && !codeFilter.has(division.code.toUpperCase())) {
			return false;
		}

		if (kindFilter && !kindFilter.has(division.kind)) {
			return false;
		}

		if (requireEmoji && (!division.emojiId || !division.emojiName)) {
			return false;
		}

		return true;
	});
}

export async function getCachedDivisionByDbId(dbId: number) {
	return (await getDivisionCacheState()).byDbId.get(dbId);
}

export async function getCachedDivisionByDiscordRoleId(discordRoleId: string) {
	return (await getDivisionCacheState()).byDiscordRoleId.get(discordRoleId);
}

export async function getCachedDivisionByCode(code: string) {
	return (await getDivisionCacheState()).byCode.get(code.toUpperCase());
}

export async function getCachedDivisionsByKind(kind: DivisionKind) {
	return (await getDivisionCacheState()).byKind.get(kind) ?? [];
}
