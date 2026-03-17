import { NameChangeRequestStatus } from '@prisma/client';
import { z } from 'zod';

import { DISCORD_MAX_NICKNAME_LENGTH } from '../../../lib/constants';
import { findUniqueNameChangeRequest } from '../name-change/read';
import {
	createNameChangeRequest,
	reviewNameChangeRequest,
	saveNameChangeRequestReviewThread,
	updatePendingNameChangeRequestRequestedName
} from '../name-change/write';

const CREATE_NAME_CHANGE_REQUEST_SCHEMA = z.object({
	requesterDbUserId: z.string().min(1),
	currentName: z.string().trim().min(1).max(100),
	requestedName: z.string().trim().min(1).max(DISCORD_MAX_NICKNAME_LENGTH),
	reason: z.string().trim().min(1).max(1_000)
});
const FIND_UNIQUE_NAME_CHANGE_REQUEST_SCHEMA = z.object({
	requestId: z.number().int().positive()
});
const REVIEW_NAME_CHANGE_REQUEST_SCHEMA = z.object({
	requestId: z.number().int().positive(),
	reviewerDbUserId: z.string().min(1),
	decision: z.enum(['approve', 'deny'])
});
const SAVE_NAME_CHANGE_REQUEST_REVIEW_THREAD_SCHEMA = z.object({
	requestId: z.number().int().positive(),
	reviewThreadId: z.string().trim().min(1)
});
const UPDATE_PENDING_NAME_CHANGE_REQUEST_REQUESTED_NAME_SCHEMA = z.object({
	requestId: z.number().int().positive(),
	requestedName: z.string().trim().min(1).max(DISCORD_MAX_NICKNAME_LENGTH)
});

export function isPendingNameChangeRequestStatus(status: NameChangeRequestStatus) {
	return status === NameChangeRequestStatus.PENDING;
}

async function createRequest(params: { requesterDbUserId: string; currentName: string; requestedName: string; reason: string }) {
	const parsed = CREATE_NAME_CHANGE_REQUEST_SCHEMA.parse(params);

	return createNameChangeRequest({
		requesterDbUserId: parsed.requesterDbUserId,
		currentName: parsed.currentName,
		requestedName: parsed.requestedName,
		reason: parsed.reason
	});
}

async function getRequest({ requestId }: { requestId: number }) {
	const parsed = FIND_UNIQUE_NAME_CHANGE_REQUEST_SCHEMA.parse({
		requestId
	});

	return findUniqueNameChangeRequest({
		requestId: parsed.requestId
	});
}

async function reviewRequest(params: { requestId: number; reviewerDbUserId: string; decision: 'approve' | 'deny' }) {
	const parsed = REVIEW_NAME_CHANGE_REQUEST_SCHEMA.parse(params);
	return reviewNameChangeRequest({
		requestId: parsed.requestId,
		reviewerDbUserId: parsed.reviewerDbUserId,
		decision: parsed.decision
	});
}

async function saveReviewThreadReference(params: { requestId: number; reviewThreadId: string }) {
	const parsed = SAVE_NAME_CHANGE_REQUEST_REVIEW_THREAD_SCHEMA.parse(params);

	return saveNameChangeRequestReviewThread({
		requestId: parsed.requestId,
		reviewThreadId: parsed.reviewThreadId
	});
}

async function updatePendingRequestedName(params: { requestId: number; requestedName: string }) {
	const parsed = UPDATE_PENDING_NAME_CHANGE_REQUEST_REQUESTED_NAME_SCHEMA.parse(params);

	return updatePendingNameChangeRequestRequestedName({
		requestId: parsed.requestId,
		requestedName: parsed.requestedName
	});
}

export const nameChangeRepository = {
	createRequest,
	getRequest,
	reviewRequest,
	saveReviewThreadReference,
	updatePendingRequestedName
};
