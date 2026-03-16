import { container } from '@sapphire/framework';

export async function getNameChangeDivisionPrefixes() {
	const divisions = await container.utilities.divisionCache.get();
	return divisions
		.flatMap((division) => [division.displayNamePrefix, division.code])
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}
