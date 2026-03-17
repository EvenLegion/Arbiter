import { NameChangeRequestStatus } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import { InvariantViolationError } from '../_shared/errors';
import type { NicknameValidationResult } from '../nickname/nicknameService';
import { toErrorDetails } from '../../logging/errorDetails';
import type { PendingNameChangeRequest, ReviewedNameChangeRequest } from './nameChangeTypes';
import type { PendingNameChangeRequestLookupDeps } from './getPendingNameChangeRequestForEdit';

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
