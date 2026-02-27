import { Utility } from '@sapphire/plugin-utilities-store';
import type { DivisionKind } from '@prisma/client';
import {
	getCachedDivisionByCode,
	getCachedDivisionByDbId,
	getCachedDivisionByDiscordRoleId,
	getCachedDivisions,
	getCachedDivisionsByKind,
	initializeDivisionCache
} from '../integrations/prisma';

type DivisionCacheQuery = {
	dbIds?: number[];
	discordRoleIds?: string[];
	codes?: string[];
	kinds?: DivisionKind[];
	requireEmoji?: boolean;
};

export class DivisionCacheUtility extends Utility {
	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'divisionCache'
		});
	}

	public async refresh() {
		await initializeDivisionCache();
	}

	public async get(query: DivisionCacheQuery = {}) {
		return getCachedDivisions(query);
	}

	public async getByDbId(dbId: number) {
		return getCachedDivisionByDbId(dbId);
	}

	public async getByDiscordRoleId(discordRoleId: string) {
		return getCachedDivisionByDiscordRoleId(discordRoleId);
	}

	public async getByCode(code: string) {
		return getCachedDivisionByCode(code);
	}

	public async getByKind(kind: DivisionKind) {
		return getCachedDivisionsByKind(kind);
	}
}

declare module '@sapphire/plugin-utilities-store' {
	interface Utilities {
		divisionCache: DivisionCacheUtility;
	}
}
