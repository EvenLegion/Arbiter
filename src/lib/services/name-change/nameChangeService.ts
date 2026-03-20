import { NameChangeRequestStatus } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import { InvariantViolationError } from '../_shared/errors';
import type { NicknameValidationResult } from '../nickname/nicknameService';
import { toErrorDetails } from '../../logging/errorDetails';
import { normalizeRequestedName } from './normalizeRequestedName';

export type PendingNameChangeRequest = {
	id: number;
	status: NameChangeRequestStatus;
	requestedName: string;
	requesterUser: {
		discordUserId: string;
	};
};

type ReviewedNameChangeStatus = Extract<NameChangeRequestStatus, 'APPROVED' | 'DENIED'>;

export type ReviewedNameChangeRequest = PendingNameChangeRequest & {
	status: ReviewedNameChangeStatus;
};

export type NameChangeReviewThreadPayload = {
	requestId: number;
	requesterDiscordUserId: string;
	requesterTag: string;
	currentName: string;
	requestedName: string;
	reason: string;
};

export type NameChangeRequester = {
	dbUserId: string;
	currentName: string;
};

export type SubmitNameChangeRequestDeps = {
	getDivisionPrefixes: () => Promise<string[]>;
	getRequester: (discordUserId: string) => Promise<NameChangeRequester | null>;
	validateRequestedNickname: (params: { discordUserId: string; requestedName: string }) => Promise<NicknameValidationResult>;
	createRequest: (params: {
		requesterDbUserId: string;
		currentName: string;
		requestedName: string;
		reason: string;
	}) => Promise<{ id: number } | null>;
	createReviewThread: (payload: NameChangeReviewThreadPayload) => Promise<{ reviewThreadId: string } | null>;
	saveReviewThreadReference: (params: { requestId: number; reviewThreadId: string }) => Promise<void>;
};

export type SubmitNameChangeRequestResult =
	| { kind: 'requester_not_found' }
	| { kind: 'invalid_requested_name'; errorMessage: string }
	| { kind: 'requester_member_not_found' }
	| { kind: 'nickname_too_long' }
	| { kind: 'validation_failed'; errorMessage: string; errorName?: string; errorCode?: string }
	| { kind: 'request_creation_failed' }
	| { kind: 'review_thread_failed'; requestId: number }
	| {
			kind: 'review_thread_reference_failed';
			requestId: number;
			reviewThreadId: string;
			errorMessage: string;
			errorName?: string;
			errorCode?: string;
	  }
	| {
			kind: 'created';
			requestId: number;
			reviewThreadId: string;
			requestedName: string;
			strippedDivisionPrefix: string | null;
	  };

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

export type EditPendingNameChangeRequestDeps = PendingNameChangeRequestLookupDeps & {
	getDivisionPrefixes: () => Promise<string[]>;
	validateRequestedNickname: (params: { discordUserId: string; requestedName: string }) => Promise<NicknameValidationResult>;
	updatePendingRequestedName: (params: { requestId: number; requestedName: string }) => Promise<{
		id: number;
		requestedName: string;
		requesterUser: {
			discordUserId: string;
		};
	} | null>;
};

export type EditPendingNameChangeRequestResult =
	| { kind: 'forbidden' }
	| { kind: 'not_found' }
	| { kind: 'already_reviewed' }
	| { kind: 'invalid_requested_name'; errorMessage: string }
	| { kind: 'requester_member_not_found' }
	| { kind: 'nickname_too_long' }
	| { kind: 'validation_failed'; errorMessage: string; errorName?: string; errorCode?: string }
	| {
			kind: 'edited';
			requestId: number;
			requesterDiscordUserId: string;
			previousRequestedName: string;
			requestedName: string;
	  };

export type ReviewNameChangeDecisionDeps = PendingNameChangeRequestLookupDeps & {
	validateRequestedNickname: (params: { discordUserId: string; requestedName: string }) => Promise<NicknameValidationResult>;
	reviewRequest: (params: {
		requestId: number;
		reviewerDbUserId: string;
		decision: 'approve' | 'deny';
	}) => Promise<PendingNameChangeRequest | null>;
	updatePersistedNickname: (params: { discordUserId: string; discordNickname: string }) => Promise<void>;
	syncApprovedNickname: (reviewed: ReviewedNameChangeRequest) => Promise<void>;
};

export type ReviewNameChangeDecisionResult =
	| { kind: 'forbidden' }
	| { kind: 'reviewer_not_found' }
	| { kind: 'already_reviewed' }
	| { kind: 'requester_member_not_found' }
	| { kind: 'nickname_too_long' }
	| { kind: 'validation_failed'; errorMessage: string; errorName?: string; errorCode?: string }
	| { kind: 'reviewed'; reviewed: ReviewedNameChangeRequest }
	| { kind: 'reviewed_sync_failed'; reviewed: ReviewedNameChangeRequest; errorMessage: string; errorName?: string; errorCode?: string };

export async function submitNameChangeRequest(
	deps: SubmitNameChangeRequestDeps,
	input: {
		actor: ActorContext;
		rawRequestedName: string;
		reason: string;
		requesterTag: string;
	}
): Promise<SubmitNameChangeRequestResult> {
	const requester = await deps.getRequester(input.actor.discordUserId);
	if (!requester) {
		return {
			kind: 'requester_not_found'
		};
	}

	const divisionPrefixes = await deps.getDivisionPrefixes();
	const normalized = normalizeRequestedName({
		rawRequestedName: input.rawRequestedName,
		divisionPrefixes
	});
	if (!normalized.success) {
		return {
			kind: 'invalid_requested_name',
			errorMessage: normalized.errorMessage
		};
	}

	const nicknameValidation = await deps.validateRequestedNickname({
		discordUserId: input.actor.discordUserId,
		requestedName: normalized.normalizedRequestedName
	});
	if (nicknameValidation.kind === 'member-not-found') {
		return {
			kind: 'requester_member_not_found'
		};
	}
	if (nicknameValidation.kind === 'nickname-too-long') {
		return {
			kind: 'nickname_too_long'
		};
	}
	if (nicknameValidation.kind === 'validation-failed') {
		return {
			kind: 'validation_failed',
			errorMessage: nicknameValidation.errorMessage,
			errorName: nicknameValidation.errorName,
			errorCode: nicknameValidation.errorCode
		};
	}

	const request = await deps.createRequest({
		requesterDbUserId: requester.dbUserId,
		currentName: requester.currentName,
		requestedName: normalized.normalizedRequestedName,
		reason: input.reason
	});
	if (!request) {
		return {
			kind: 'request_creation_failed'
		};
	}

	const thread = await deps.createReviewThread({
		requestId: request.id,
		requesterDiscordUserId: input.actor.discordUserId,
		requesterTag: input.requesterTag,
		currentName: requester.currentName,
		requestedName: normalized.normalizedRequestedName,
		reason: input.reason
	});
	if (!thread) {
		return {
			kind: 'review_thread_failed',
			requestId: request.id
		};
	}

	try {
		await deps.saveReviewThreadReference({
			requestId: request.id,
			reviewThreadId: thread.reviewThreadId
		});
	} catch (error) {
		return {
			kind: 'review_thread_reference_failed',
			requestId: request.id,
			reviewThreadId: thread.reviewThreadId,
			...toErrorDetails(error)
		};
	}

	return {
		kind: 'created',
		requestId: request.id,
		reviewThreadId: thread.reviewThreadId,
		requestedName: normalized.normalizedRequestedName,
		strippedDivisionPrefix: normalized.strippedDivisionPrefix
	};
}

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

export async function editPendingNameChangeRequest(
	deps: EditPendingNameChangeRequestDeps,
	input: {
		actor: ActorContext;
		requestId: number;
		rawRequestedName: string;
	}
): Promise<EditPendingNameChangeRequestResult> {
	if (!input.actor.capabilities.isStaff) {
		return {
			kind: 'forbidden'
		};
	}

	const existingRequest = await deps.findRequest({
		requestId: input.requestId
	});
	if (!existingRequest) {
		return {
			kind: 'not_found'
		};
	}
	if (existingRequest.status !== NameChangeRequestStatus.PENDING) {
		return {
			kind: 'already_reviewed'
		};
	}

	const divisionPrefixes = await deps.getDivisionPrefixes();
	const normalized = normalizeRequestedName({
		rawRequestedName: input.rawRequestedName,
		divisionPrefixes
	});
	if (!normalized.success) {
		return {
			kind: 'invalid_requested_name',
			errorMessage: normalized.errorMessage
		};
	}

	const nicknameValidation = await deps.validateRequestedNickname({
		discordUserId: existingRequest.requesterUser.discordUserId,
		requestedName: normalized.normalizedRequestedName
	});
	if (nicknameValidation.kind === 'member-not-found') {
		return {
			kind: 'requester_member_not_found'
		};
	}
	if (nicknameValidation.kind === 'nickname-too-long') {
		return {
			kind: 'nickname_too_long'
		};
	}
	if (nicknameValidation.kind === 'validation-failed') {
		return {
			kind: 'validation_failed',
			errorMessage: nicknameValidation.errorMessage,
			errorName: nicknameValidation.errorName,
			errorCode: nicknameValidation.errorCode
		};
	}

	const updated = await deps.updatePendingRequestedName({
		requestId: input.requestId,
		requestedName: normalized.normalizedRequestedName
	});
	if (!updated) {
		return {
			kind: 'already_reviewed'
		};
	}

	return {
		kind: 'edited',
		requestId: updated.id,
		requesterDiscordUserId: updated.requesterUser.discordUserId,
		previousRequestedName: existingRequest.requestedName,
		requestedName: updated.requestedName
	};
}

export async function reviewNameChangeDecision(
	deps: ReviewNameChangeDecisionDeps,
	input: {
		actor: ActorContext;
		requestId: number;
		decision: 'approve' | 'deny';
	}
): Promise<ReviewNameChangeDecisionResult> {
	if (!input.actor.capabilities.isStaff) {
		return {
			kind: 'forbidden'
		};
	}
	if (!input.actor.dbUserId) {
		return {
			kind: 'reviewer_not_found'
		};
	}

	const request = await deps.findRequest({
		requestId: input.requestId
	});
	if (!request || request.status !== NameChangeRequestStatus.PENDING) {
		return {
			kind: 'already_reviewed'
		};
	}

	if (input.decision === 'approve') {
		const nicknameValidation = await deps.validateRequestedNickname({
			discordUserId: request.requesterUser.discordUserId,
			requestedName: request.requestedName
		});
		if (nicknameValidation.kind === 'member-not-found') {
			return {
				kind: 'requester_member_not_found'
			};
		}
		if (nicknameValidation.kind === 'nickname-too-long') {
			return {
				kind: 'nickname_too_long'
			};
		}
		if (nicknameValidation.kind === 'validation-failed') {
			return {
				kind: 'validation_failed',
				errorMessage: nicknameValidation.errorMessage,
				errorName: nicknameValidation.errorName,
				errorCode: nicknameValidation.errorCode
			};
		}
	}

	const reviewed = await deps.reviewRequest({
		requestId: input.requestId,
		reviewerDbUserId: input.actor.dbUserId,
		decision: input.decision
	});
	if (!reviewed) {
		return {
			kind: 'already_reviewed'
		};
	}
	if (reviewed.status === NameChangeRequestStatus.PENDING) {
		throw new InvariantViolationError(`Invalid reviewed name change status: ${reviewed.status}`);
	}
	const reviewedRequest = reviewed as ReviewedNameChangeRequest;

	if (reviewedRequest.status === NameChangeRequestStatus.APPROVED) {
		try {
			await deps.updatePersistedNickname({
				discordUserId: reviewedRequest.requesterUser.discordUserId,
				discordNickname: reviewedRequest.requestedName
			});
			await deps.syncApprovedNickname(reviewedRequest);
		} catch (error) {
			return {
				kind: 'reviewed_sync_failed',
				reviewed: reviewedRequest,
				...toErrorDetails(error)
			};
		}
	}

	return {
		kind: 'reviewed',
		reviewed: reviewedRequest
	};
}
