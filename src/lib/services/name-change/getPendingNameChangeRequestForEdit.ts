import { NameChangeRequestStatus } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import type { PendingNameChangeRequest } from './nameChangeTypes';

export type PendingNameChangeRequestLookupDeps = {
	findRequest: (params: { requestId: number }) => Promise<PendingNameChangeRequest | null>;
};

export type GetPendingNameChangeRequestForEditResult =
	| { kind: 'forbidden' }
	| { kind: 'not_found' }
	| { kind: 'already_reviewed' }
	| {
			kind: 'editable';
			requestId: number;
			requestedName: string;
	  };

export async function getPendingNameChangeRequestForEdit(
	deps: PendingNameChangeRequestLookupDeps,
	input: {
		actor: ActorContext;
		requestId: number;
	}
): Promise<GetPendingNameChangeRequestForEditResult> {
	if (!input.actor.capabilities.isStaff) {
		return {
			kind: 'forbidden'
		};
	}

	const request = await deps.findRequest({
		requestId: input.requestId
	});
	if (!request) {
		return {
			kind: 'not_found'
		};
	}
	if (request.status !== NameChangeRequestStatus.PENDING) {
		return {
			kind: 'already_reviewed'
		};
	}

	return {
		kind: 'editable',
		requestId: request.id,
		requestedName: request.requestedName
	};
}
