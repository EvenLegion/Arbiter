import { EventSessionState, type EventReviewDecisionKind } from '@prisma/client';

import { ENV_CONFIG } from '../../../../config/env/config';
import { prisma } from '../../prisma';

export type EventReviewPageAttendee = {
	dbUserId: string;
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	attendedSeconds: number;
	decision: EventReviewDecisionKind | null;
};

export function resolveEventReviewPageSize({ eventState, pageSize }: { eventState: EventSessionState; pageSize: number | undefined }) {
	if (typeof pageSize === 'number') {
		return pageSize;
	}

	return eventState === EventSessionState.ENDED_PENDING_REVIEW ? ENV_CONFIG.EVENT_REVIEW_PAGE_SIZE : ENV_CONFIG.EVENT_REVIEW_FINALIZED_PAGE_SIZE;
}

export function resolveEventReviewPageBounds({ page, pageSize, attendeeCount }: { page: number; pageSize: number; attendeeCount: number }) {
	const totalPages = Math.max(1, Math.ceil(attendeeCount / pageSize));
	const resolvedPage = Math.min(page, totalPages);

	return {
		totalPages,
		resolvedPage,
		skip: (resolvedPage - 1) * pageSize
	};
}

export async function findEventReviewParticipantRows({ eventSessionId, skip, pageSize }: { eventSessionId: number; skip: number; pageSize: number }) {
	return prisma.eventParticipantStat.findMany({
		where: {
			eventSessionId
		},
		orderBy: [{ attendedSeconds: 'desc' }, { userId: 'asc' }],
		skip,
		take: pageSize,
		select: {
			userId: true,
			attendedSeconds: true,
			user: {
				select: {
					discordUserId: true,
					discordUsername: true,
					discordNickname: true
				}
			}
		}
	});
}

export async function findEventReviewDecisionRows({ eventSessionId, targetUserIds }: { eventSessionId: number; targetUserIds: string[] }) {
	if (targetUserIds.length === 0) {
		return [];
	}

	return prisma.eventReviewDecision.findMany({
		where: {
			eventSessionId,
			targetUserId: {
				in: targetUserIds
			}
		},
		select: {
			targetUserId: true,
			decision: true
		}
	});
}

export function mapEventReviewAttendees({
	participantRows,
	decisionRows
}: {
	participantRows: Awaited<ReturnType<typeof findEventReviewParticipantRows>>;
	decisionRows: Awaited<ReturnType<typeof findEventReviewDecisionRows>>;
}): EventReviewPageAttendee[] {
	const decisionByUserId = new Map(decisionRows.map((row) => [row.targetUserId, row.decision]));

	return participantRows.map((row) => ({
		dbUserId: row.userId,
		discordUserId: row.user.discordUserId,
		discordUsername: row.user.discordUsername,
		discordNickname: row.user.discordNickname,
		attendedSeconds: row.attendedSeconds,
		decision: decisionByUserId.get(row.userId) ?? null
	}));
}
