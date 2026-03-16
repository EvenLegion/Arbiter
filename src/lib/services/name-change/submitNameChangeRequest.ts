import type { ActorContext } from '../_shared/actor';
import type { NicknameValidationResult } from '../nickname/nicknameService';
import { normalizeRequestedName } from '../../features/ticket/normalizeRequestedName';
import type { NameChangeRequester, NameChangeReviewThreadPayload } from './nameChangeTypes';

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
	| { kind: 'validation_failed' }
	| { kind: 'request_creation_failed' }
	| { kind: 'review_thread_failed'; requestId: number }
	| { kind: 'review_thread_reference_failed'; requestId: number; reviewThreadId: string }
	| {
			kind: 'created';
			requestId: number;
			reviewThreadId: string;
			requestedName: string;
			strippedDivisionPrefix: string | null;
	  };

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
			kind: 'validation_failed'
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
	} catch {
		return {
			kind: 'review_thread_reference_failed',
			requestId: request.id,
			reviewThreadId: thread.reviewThreadId
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
