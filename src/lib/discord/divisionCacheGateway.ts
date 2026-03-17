import type { DivisionKind } from '@prisma/client';
import {
	getCachedDivisionByCode as readCachedDivisionByCode,
	getCachedDivisionByDbId as readCachedDivisionByDbId,
	getCachedDivisionByDiscordRoleId as readCachedDivisionByDiscordRoleId,
	getCachedDivisions as readCachedDivisions,
	initializeDivisionCache
} from '../../integrations/prisma';

export function refreshDivisionCache() {
	return initializeDivisionCache();
}

export function listCachedDivisions({
	ids,
	codes,
	kinds,
	requireEmoji
}: {
	ids?: number[];
	codes?: string[];
	kinds?: DivisionKind[];
	requireEmoji?: boolean;
} = {}) {
	return readCachedDivisions({
		ids,
		codes,
		kinds,
		requireEmoji
	});
}

export function getCachedDivisionByDbId(dbId: number) {
	return readCachedDivisionByDbId(dbId);
}

export function getCachedDivisionByDiscordRoleId(discordRoleId: string) {
	return readCachedDivisionByDiscordRoleId(discordRoleId);
}

export function getCachedDivisionByCode(code: string) {
	return readCachedDivisionByCode(code);
}
