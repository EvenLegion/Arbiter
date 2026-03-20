import { NameChangeRequestStatus } from '@prisma/client';
import { createNameChangeRequest } from '../name-change/createNameChangeRequest';
import { findUniqueNameChangeRequest } from '../name-change/read';
import { reviewNameChangeRequest } from '../name-change/reviewNameChangeRequest';
import { saveNameChangeRequestReviewThread } from '../name-change/saveNameChangeRequestReviewThread';
import { updatePendingNameChangeRequestRequestedName } from '../name-change/updatePendingNameChangeRequestRequestedName';

export function isPendingNameChangeRequestStatus(status: NameChangeRequestStatus) {
	return status === NameChangeRequestStatus.PENDING;
}

export const nameChangeRepository = {
	createRequest: createNameChangeRequest,
	getRequest: findUniqueNameChangeRequest,
	reviewRequest: reviewNameChangeRequest,
	saveReviewThreadReference: saveNameChangeRequestReviewThread,
	updatePendingRequestedName: updatePendingNameChangeRequestRequestedName
};
