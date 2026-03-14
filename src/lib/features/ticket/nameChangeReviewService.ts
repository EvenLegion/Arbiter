import { NameChangeRequestStatus } from '@prisma/client';

type ReviewedNameChangeStatus = Extract<NameChangeRequestStatus, 'APPROVED' | 'DENIED'>;

export type PendingNameChangeReviewRequest = {
	id: number;
	status: NameChangeRequestStatus;
	requestedName: string;
	requesterUser: {
		discordUserId: string;
	};
};

export type ReviewedNameChangeRequest = PendingNameChangeReviewRequest & {
	status: ReviewedNameChangeStatus;
};

export type NameChangeApprovalValidationResult =
	| {
			ok: true;
	  }
	| {
			ok: false;
			reason: 'nickname-too-long';
	  };

type NameChangeReviewServiceDeps = {
	findRequest: (params: { requestId: number }) => Promise<PendingNameChangeReviewRequest | null>;
	validateApproval: (request: PendingNameChangeReviewRequest) => Promise<NameChangeApprovalValidationResult>;
	reviewRequest: (params: {
		requestId: number;
		reviewerDbUserId: string;
		decision: 'approve' | 'deny';
	}) => Promise<PendingNameChangeReviewRequest | null>;
	updatePersistedNickname: (params: { discordUserId: string; discordNickname: string }) => Promise<void>;
	syncApprovedNickname: (reviewed: ReviewedNameChangeRequest) => Promise<void>;
};

type ReviewNameChangeDecisionInput = {
	requestId: number;
	reviewerDbUserId: string;
	decision: 'approve' | 'deny';
};

export type ReviewNameChangeDecisionResult =
	| {
			outcome: 'already-reviewed';
	  }
	| {
			outcome: 'nickname-too-long';
	  }
	| {
			outcome: 'reviewed';
			reviewed: ReviewedNameChangeRequest;
	  };

export async function reviewNameChangeDecision(
	deps: NameChangeReviewServiceDeps,
	input: ReviewNameChangeDecisionInput
): Promise<ReviewNameChangeDecisionResult> {
	const request = await deps.findRequest({
		requestId: input.requestId
	});
	if (!request || request.status !== NameChangeRequestStatus.PENDING) {
		return {
			outcome: 'already-reviewed'
		};
	}

	if (input.decision === 'approve') {
		const validation = await deps.validateApproval(request);
		if (!validation.ok && validation.reason === 'nickname-too-long') {
			return {
				outcome: 'nickname-too-long'
			};
		}
	}

	const reviewed = await deps.reviewRequest(input);
	if (!reviewed) {
		return {
			outcome: 'already-reviewed'
		};
	}
	assertReviewedNameChangeRequest(reviewed);

	if (reviewed.status === NameChangeRequestStatus.APPROVED) {
		await deps.updatePersistedNickname({
			discordUserId: reviewed.requesterUser.discordUserId,
			discordNickname: reviewed.requestedName
		});
		await deps.syncApprovedNickname(reviewed);
	}

	return {
		outcome: 'reviewed',
		reviewed
	};
}

function assertReviewedNameChangeRequest(request: PendingNameChangeReviewRequest): asserts request is ReviewedNameChangeRequest {
	if (request.status === NameChangeRequestStatus.PENDING) {
		throw new Error(`Name change review returned an invalid status: ${request.status}`);
	}
}
