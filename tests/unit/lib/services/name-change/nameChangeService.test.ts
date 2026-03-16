import { NameChangeRequestStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
	editPendingNameChangeRequest,
	getPendingNameChangeRequestForEdit,
	reviewNameChangeDecision,
	submitNameChangeRequest,
	type PendingNameChangeRequest,
	type ReviewedNameChangeRequest
} from '../../../../../src/lib/services/name-change/nameChangeService';

describe('nameChangeService', () => {
	it('creates a request and review thread for a valid submission', async () => {
		const deps = createSubmitDeps();

		const result = await submitNameChangeRequest(deps, {
			actor: createActor(),
			rawRequestedName: 'ARC | NewCallsign',
			reason: 'Updated in game name',
			requesterTag: 'Requester#1234'
		});

		expect(result).toEqual({
			kind: 'created',
			requestId: 42,
			reviewThreadId: 'thread-42',
			requestedName: 'NewCallsign',
			strippedDivisionPrefix: 'ARC'
		});
		expect(deps.createRequest).toHaveBeenCalledWith({
			requesterDbUserId: 'db-user-1',
			currentName: 'CurrentCallsign',
			requestedName: 'NewCallsign',
			reason: 'Updated in game name'
		});
		expect(deps.saveReviewThreadReference).toHaveBeenCalledWith({
			requestId: 42,
			reviewThreadId: 'thread-42'
		});
	});

	it('returns a validation result when the requested nickname would be too long', async () => {
		const deps = createSubmitDeps({
			validateRequestedNicknameResult: {
				kind: 'nickname-too-long'
			}
		});

		await expect(
			submitNameChangeRequest(deps, {
				actor: createActor(),
				rawRequestedName: 'ThisWillOverflow',
				reason: 'Need it',
				requesterTag: 'Requester#1234'
			})
		).resolves.toEqual({
			kind: 'nickname_too_long'
		});
		expect(deps.createRequest).not.toHaveBeenCalled();
	});

	it('rejects requested names that still include an invalid division-style prefix', async () => {
		const deps = createSubmitDeps();

		await expect(
			submitNameChangeRequest(deps, {
				actor: createActor(),
				rawRequestedName: 'UNKNOWN | ',
				reason: 'Need it',
				requesterTag: 'Requester#1234'
			})
		).resolves.toEqual({
			kind: 'invalid_requested_name',
			errorMessage:
				'Requested name is invalid. Do not include division prefixes. Use only your base nickname (no "|", spaces, or merit rank symbols).'
		});
		expect(deps.validateRequestedNickname).not.toHaveBeenCalled();
	});

	it('returns the current pending request when staff opens the edit flow', async () => {
		const request = buildPendingRequest();

		await expect(
			getPendingNameChangeRequestForEdit(
				{
					findRequest: vi.fn().mockResolvedValue(request)
				},
				{
					actor: createActor({ isStaff: true }),
					requestId: request.id
				}
			)
		).resolves.toEqual({
			kind: 'editable',
			requestId: request.id,
			requestedName: request.requestedName
		});
	});

	it('edits a pending request after normalizing the new requested name', async () => {
		const existingRequest = buildPendingRequest();
		const deps = {
			getDivisionPrefixes: vi.fn().mockResolvedValue(['ARC']),
			findRequest: vi.fn().mockResolvedValue(existingRequest),
			validateRequestedNickname: vi.fn().mockResolvedValue({ kind: 'valid' }),
			updatePendingRequestedName: vi.fn().mockResolvedValue({
				id: existingRequest.id,
				requestedName: 'EditedName',
				requesterUser: {
					discordUserId: existingRequest.requesterUser.discordUserId
				}
			})
		};

		const result = await editPendingNameChangeRequest(deps, {
			actor: createActor({ isStaff: true }),
			requestId: existingRequest.id,
			rawRequestedName: 'ARC | EditedName'
		});

		expect(result).toEqual({
			kind: 'edited',
			requestId: existingRequest.id,
			requesterDiscordUserId: existingRequest.requesterUser.discordUserId,
			previousRequestedName: existingRequest.requestedName,
			requestedName: 'EditedName'
		});
		expect(deps.updatePendingRequestedName).toHaveBeenCalledWith({
			requestId: existingRequest.id,
			requestedName: 'EditedName'
		});
	});

	it('rejects editing a request that was already reviewed', async () => {
		await expect(
			editPendingNameChangeRequest(
				{
					getDivisionPrefixes: vi.fn().mockResolvedValue(['ARC']),
					findRequest: vi.fn().mockResolvedValue(buildReviewedRequest(NameChangeRequestStatus.APPROVED)),
					validateRequestedNickname: vi.fn(),
					updatePendingRequestedName: vi.fn()
				},
				{
					actor: createActor({ isStaff: true }),
					requestId: 42,
					rawRequestedName: 'EditedName'
				}
			)
		).resolves.toEqual({
			kind: 'already_reviewed'
		});
	});

	it('approves a pending request and applies nickname persistence and sync', async () => {
		const pendingRequest = buildPendingRequest();
		const reviewedRequest = buildReviewedRequest(NameChangeRequestStatus.APPROVED);
		const deps = createReviewDeps({
			findRequestResult: pendingRequest,
			reviewRequestResult: reviewedRequest
		});

		const result = await reviewNameChangeDecision(deps, {
			actor: createActor({ isStaff: true, dbUserId: 'reviewer-db-user-id' }),
			requestId: pendingRequest.id,
			decision: 'approve'
		});

		expect(result).toEqual({
			kind: 'reviewed',
			reviewed: reviewedRequest
		});
		expect(deps.validateRequestedNickname).toHaveBeenCalledWith({
			discordUserId: pendingRequest.requesterUser.discordUserId,
			requestedName: pendingRequest.requestedName
		});
		expect(deps.updatePersistedNickname).toHaveBeenCalledWith({
			discordUserId: reviewedRequest.requesterUser.discordUserId,
			discordNickname: reviewedRequest.requestedName
		});
		expect(deps.syncApprovedNickname).toHaveBeenCalledWith(reviewedRequest);
	});

	it('denies a pending request without nickname side effects', async () => {
		const pendingRequest = buildPendingRequest();
		const reviewedRequest = buildReviewedRequest(NameChangeRequestStatus.DENIED);
		const deps = createReviewDeps({
			findRequestResult: pendingRequest,
			reviewRequestResult: reviewedRequest
		});

		const result = await reviewNameChangeDecision(deps, {
			actor: createActor({ isStaff: true, dbUserId: 'reviewer-db-user-id' }),
			requestId: pendingRequest.id,
			decision: 'deny'
		});

		expect(result).toEqual({
			kind: 'reviewed',
			reviewed: reviewedRequest
		});
		expect(deps.validateRequestedNickname).not.toHaveBeenCalled();
		expect(deps.updatePersistedNickname).not.toHaveBeenCalled();
		expect(deps.syncApprovedNickname).not.toHaveBeenCalled();
	});

	it('returns a typed branch when nickname sync fails after approval', async () => {
		const pendingRequest = buildPendingRequest();
		const reviewedRequest = buildReviewedRequest(NameChangeRequestStatus.APPROVED);
		const deps = createReviewDeps({
			findRequestResult: pendingRequest,
			reviewRequestResult: reviewedRequest
		});
		deps.syncApprovedNickname.mockRejectedValueOnce(new Error('sync failed'));

		const result = await reviewNameChangeDecision(deps, {
			actor: createActor({ isStaff: true, dbUserId: 'reviewer-db-user-id' }),
			requestId: pendingRequest.id,
			decision: 'approve'
		});

		expect(result).toEqual({
			kind: 'reviewed_sync_failed',
			reviewed: reviewedRequest
		});
	});
});

function createActor({
	isStaff = false,
	dbUserId = null as string | null
}: {
	isStaff?: boolean;
	dbUserId?: string | null;
} = {}) {
	return {
		discordUserId: 'discord-user-1',
		dbUserId,
		capabilities: {
			isStaff,
			isCenturion: false
		}
	};
}

function createSubmitDeps({
	validateRequestedNicknameResult = { kind: 'valid' } as const
}: {
	validateRequestedNicknameResult?:
		| { kind: 'valid' }
		| { kind: 'member-not-found' }
		| { kind: 'nickname-too-long' }
		| { kind: 'validation-failed' };
} = {}) {
	return {
		getDivisionPrefixes: vi.fn().mockResolvedValue(['ARC']),
		getRequester: vi.fn().mockResolvedValue({
			dbUserId: 'db-user-1',
			currentName: 'CurrentCallsign'
		}),
		validateRequestedNickname: vi.fn().mockResolvedValue(validateRequestedNicknameResult),
		createRequest: vi.fn().mockResolvedValue({
			id: 42
		}),
		createReviewThread: vi.fn().mockResolvedValue({
			reviewThreadId: 'thread-42'
		}),
		saveReviewThreadReference: vi.fn().mockResolvedValue(undefined)
	};
}

function createReviewDeps({
	findRequestResult = buildPendingRequest(),
	reviewRequestResult = buildReviewedRequest(NameChangeRequestStatus.APPROVED)
}: {
	findRequestResult?: PendingNameChangeRequest | null;
	reviewRequestResult?: ReviewedNameChangeRequest | null;
} = {}) {
	return {
		findRequest: vi.fn().mockResolvedValue(findRequestResult),
		validateRequestedNickname: vi.fn().mockResolvedValue({ kind: 'valid' }),
		reviewRequest: vi.fn().mockResolvedValue(reviewRequestResult),
		updatePersistedNickname: vi.fn().mockResolvedValue(undefined),
		syncApprovedNickname: vi.fn().mockResolvedValue(undefined)
	};
}

function buildPendingRequest(): PendingNameChangeRequest {
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
