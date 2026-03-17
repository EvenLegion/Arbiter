import { listCachedDivisions } from '../../discord/divisionCacheGateway';

export async function getNameChangeDivisionPrefixes() {
	const divisions = await listCachedDivisions();
	return divisions
		.flatMap((division) => [division.displayNamePrefix, division.code])
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}
