import { NameChangeRequestStatus } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';
import type { NicknameValidationResult } from '../nickname/nicknameService';
import { normalizeRequestedName } from '../../features/ticket/normalizeRequestedName';
import type { PendingNameChangeRequestLookupDeps } from './getPendingNameChangeRequestForEdit';

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
	| { kind: 'validation_failed' }
	| {
			kind: 'edited';
			requestId: number;
			requesterDiscordUserId: string;
			previousRequestedName: string;
			requestedName: string;
	  };

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
			kind: 'validation_failed'
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
