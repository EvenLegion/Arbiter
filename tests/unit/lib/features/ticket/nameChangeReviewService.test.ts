import { NameChangeRequestStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
	reviewNameChangeDecision,
	type NameChangeApprovalValidationResult,
	type PendingNameChangeReviewRequest,
	type ReviewedNameChangeRequest
} from '../../../../../src/lib/features/ticket/nameChangeReviewService';

describe('nameChangeReviewService', () => {
	it('approves a pending request and applies nickname persistence and sync', async () => {
		const pendingRequest = buildPendingRequest();
		const reviewedRequest = buildReviewedRequest(NameChangeRequestStatus.APPROVED);
		const deps = createDeps({
			findRequestResult: pendingRequest,
			reviewRequestResult: reviewedRequest
		});

		const result = await reviewNameChangeDecision(deps, {
			requestId: pendingRequest.id,
			reviewerDbUserId: 'reviewer-db-user-id',
			decision: 'approve'
		});

		expect(result).toEqual({
			outcome: 'reviewed',
			reviewed: reviewedRequest
		});
		expect(deps.validateApproval).toHaveBeenCalledWith(pendingRequest);
		expect(deps.reviewRequest).toHaveBeenCalledWith({
			requestId: pendingRequest.id,
			reviewerDbUserId: 'reviewer-db-user-id',
			decision: 'approve'
		});
		expect(deps.updatePersistedNickname).toHaveBeenCalledWith({
			discordUserId: reviewedRequest.requesterUser.discordUserId,
			discordNickname: reviewedRequest.requestedName
		});
		expect(deps.syncApprovedNickname).toHaveBeenCalledWith(reviewedRequest);
	});

	it('denies a pending request without approval validation or nickname sync side effects', async () => {
		const pendingRequest = buildPendingRequest();
		const reviewedRequest = buildReviewedRequest(NameChangeRequestStatus.DENIED);
		const deps = createDeps({
			findRequestResult: pendingRequest,
			reviewRequestResult: reviewedRequest
		});

		const result = await reviewNameChangeDecision(deps, {
			requestId: pendingRequest.id,
			reviewerDbUserId: 'reviewer-db-user-id',
			decision: 'deny'
		});

		expect(result).toEqual({
			outcome: 'reviewed',
			reviewed: reviewedRequest
		});
		expect(deps.validateApproval).not.toHaveBeenCalled();
		expect(deps.updatePersistedNickname).not.toHaveBeenCalled();
		expect(deps.syncApprovedNickname).not.toHaveBeenCalled();
	});

	it('returns already-reviewed when the request is missing or no longer pending', async () => {
		const deps = createDeps({
			findRequestResult: {
				...buildPendingRequest(),
				status: NameChangeRequestStatus.APPROVED
			}
		});

		await expect(
			reviewNameChangeDecision(deps, {
				requestId: 42,
				reviewerDbUserId: 'reviewer-db-user-id',
				decision: 'approve'
			})
		).resolves.toEqual({
			outcome: 'already-reviewed'
		});
		expect(deps.reviewRequest).not.toHaveBeenCalled();
		expect(deps.updatePersistedNickname).not.toHaveBeenCalled();
		expect(deps.syncApprovedNickname).not.toHaveBeenCalled();
	});

	it('returns a typed nickname-too-long result when approval validation fails', async () => {
		const pendingRequest = buildPendingRequest();
		const deps = createDeps({
			findRequestResult: pendingRequest,
			validateApprovalResult: {
				ok: false,
				reason: 'nickname-too-long'
			}
		});

		const result = await reviewNameChangeDecision(deps, {
			requestId: pendingRequest.id,
			reviewerDbUserId: 'reviewer-db-user-id',
			decision: 'approve'
		});

		expect(result).toEqual({
			outcome: 'nickname-too-long'
		});
		expect(deps.reviewRequest).not.toHaveBeenCalled();
		expect(deps.updatePersistedNickname).not.toHaveBeenCalled();
		expect(deps.syncApprovedNickname).not.toHaveBeenCalled();
	});

	it('returns already-reviewed when the pending row is lost before the review mutation', async () => {
		const pendingRequest = buildPendingRequest();
		const deps = createDeps({
			findRequestResult: pendingRequest,
			reviewRequestResult: null
		});

		const result = await reviewNameChangeDecision(deps, {
			requestId: pendingRequest.id,
			reviewerDbUserId: 'reviewer-db-user-id',
			decision: 'approve'
		});

		expect(result).toEqual({
			outcome: 'already-reviewed'
		});
		expect(deps.updatePersistedNickname).not.toHaveBeenCalled();
		expect(deps.syncApprovedNickname).not.toHaveBeenCalled();
	});
});

function createDeps({
	findRequestResult = buildPendingRequest(),
	validateApprovalResult = { ok: true } as NameChangeApprovalValidationResult,
	reviewRequestResult = buildReviewedRequest(NameChangeRequestStatus.APPROVED)
}: {
	findRequestResult?: PendingNameChangeReviewRequest | null;
	validateApprovalResult?: NameChangeApprovalValidationResult;
	reviewRequestResult?: ReviewedNameChangeRequest | null;
} = {}) {
	return {
		findRequest: vi.fn().mockResolvedValue(findRequestResult),
		validateApproval: vi.fn().mockResolvedValue(validateApprovalResult),
		reviewRequest: vi.fn().mockResolvedValue(reviewRequestResult),
		updatePersistedNickname: vi.fn().mockResolvedValue(undefined),
		syncApprovedNickname: vi.fn().mockResolvedValue(undefined)
	};
}

function buildPendingRequest(): PendingNameChangeReviewRequest {
	return {
		id: 42,
		status: NameChangeRequestStatus.PENDING,
		requestedName: 'NewCallsign',
		requesterUser: {
			discordUserId: 'discord-user-1'
		}
	};
}

function buildReviewedRequest(status: NameChangeRequestStatus.APPROVED | NameChangeRequestStatus.DENIED): ReviewedNameChangeRequest {
	return {
		...buildPendingRequest(),
		status
	};
}
