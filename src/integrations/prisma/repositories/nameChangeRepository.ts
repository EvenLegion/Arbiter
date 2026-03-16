import { createNameChangeRequest } from '../createNameChangeRequest';
import { findUniqueNameChangeRequest, isPendingNameChangeRequestStatus } from '../findUniqueNameChangeRequest';
import { reviewNameChangeRequest } from '../reviewNameChangeRequest';
import { saveNameChangeRequestReviewThread } from '../saveNameChangeRequestReviewThread';
import { updatePendingNameChangeRequestRequestedName } from '../updatePendingNameChangeRequestRequestedName';

export { isPendingNameChangeRequestStatus };

export const nameChangeRepository = {
	createRequest: createNameChangeRequest,
	getRequest: findUniqueNameChangeRequest,
	reviewRequest: reviewNameChangeRequest,
	saveReviewThreadReference: saveNameChangeRequestReviewThread,
	updatePendingRequestedName: updatePendingNameChangeRequestRequestedName
};
