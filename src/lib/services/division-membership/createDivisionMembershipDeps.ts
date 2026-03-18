import { divisionRepository } from '../../../integrations/prisma/repositories';
import { listCachedDivisions } from '../../discord/guild/divisions';
import type { ReconciledDivision } from './reconcileDivisionMemberships';

type CachedDivision = Awaited<ReturnType<typeof listCachedDivisions>>[number];

function mapTrackedDivision(division: CachedDivision): ReconciledDivision {
	return {
		id: division.id,
		name: division.name,
		discordRoleId: division.discordRoleId
	};
}

export function createDivisionMembershipDeps({ trackedDivisions }: { trackedDivisions?: CachedDivision[] } = {}) {
	return {
		listTrackedDivisions: async () => (trackedDivisions ?? (await listCachedDivisions({}))).map(mapTrackedDivision),
		listUserDivisions: ({ discordUserId }: { discordUserId: string }) =>
			divisionRepository.listUserDivisions({
				discordUserId
			}),
		addMemberships: async ({ discordUserId, divisionIds }: { discordUserId: string; divisionIds: number[] }) => {
			await divisionRepository.addMemberships({
				discordUserId,
				divisionIds
			});
		},
		removeMemberships: async ({ discordUserId, divisionIds }: { discordUserId: string; divisionIds: number[] }) => {
			await divisionRepository.removeMemberships({
				discordUserId,
				divisionIds
			});
		}
	};
}
