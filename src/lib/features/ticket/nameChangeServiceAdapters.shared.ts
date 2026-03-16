import { nameChangeRepository } from '../../../integrations/prisma/repositories';

export function createNameChangeRequestLookupDeps() {
	return {
		findRequest: nameChangeRepository.getRequest
	};
}
