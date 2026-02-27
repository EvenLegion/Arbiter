import type { Division, DivisionKind } from '@prisma/client';

import { container } from '@sapphire/framework';
import { findManyDivisions } from '../findManyDivisions';

type DivisionCacheState = {
	divisions: Division[];
	byDbId: Map<number, Division>;
	byDiscordRoleId: Map<string, Division>;
	byCode: Map<string, Division>;
	byKind: Map<DivisionKind, Division[]>;
};

let divisionCache: DivisionCacheState | null = null;

export async function initializeDivisionCache() {
	const caller = 'initializeDivisionCache';

	const divisions = await findManyDivisions();
	const byDbId = new Map<number, Division>();
	const byDiscordRoleId = new Map<string, Division>();
	const byCode = new Map<string, Division>();
	const byKind = new Map<DivisionKind, Division[]>();

	for (const division of divisions) {
		byDbId.set(division.id, division);
		if (division.discordRoleId) byDiscordRoleId.set(division.discordRoleId, division);
		byCode.set(division.code.toUpperCase(), division);

		if (!byKind.has(division.kind)) {
			byKind.set(division.kind, []);
		}
		byKind.get(division.kind)!.push(division);
	}

	divisionCache = {
		divisions,
		byDbId,
		byDiscordRoleId,
		byCode,
		byKind
	};

	container.logger.debug(
		{
			caller,
			divisionCount: divisions.length
		},
		'Division cache initialized successfully'
	);
}

export async function getDivisionCacheState() {
	if (!divisionCache) {
		container.logger.warn('Division cache not initialized, initializing now');
		await initializeDivisionCache();
	}

	return divisionCache!;
}
