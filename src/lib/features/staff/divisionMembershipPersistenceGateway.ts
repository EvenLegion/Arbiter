import { divisionRepository } from '../../../integrations/prisma/repositories';

export function createDivisionMembershipPersistenceGateway() {
	return {
		listMemberships: (userId: string) =>
			divisionRepository.listMemberships({
				userId
			}),
		addMemberships: divisionRepository.addMemberships,
		removeMemberships: divisionRepository.removeMemberships
	};
}
