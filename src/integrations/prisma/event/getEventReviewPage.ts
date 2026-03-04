import { type EventReviewDecisionKind, type EventSessionState } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';

type GetEventReviewPageParams = {
	eventSessionId: number;
	page?: number;
	pageSize?: number;
};

export type EventReviewPageAttendee = {
	dbUserId: string;
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	attendedSeconds: number;
	decision: EventReviewDecisionKind | null;
};

export type EventReviewPage = {
	eventSession: {
		id: number;
		name: string;
		state: EventSessionState;
		threadId: string;
		startedAt: Date | null;
		endedAt: Date | null;
	};
	attendeeCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
	attendees: EventReviewPageAttendee[];
};

const GET_EVENT_REVIEW_PAGE_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().positive().max(25).default(4)
});

export async function getEventReviewPage({ eventSessionId, page = 1, pageSize = 4 }: GetEventReviewPageParams): Promise<EventReviewPage | null> {
	const parsed = GET_EVENT_REVIEW_PAGE_SCHEMA.parse({
		eventSessionId,
		page,
		pageSize
	});

	const eventSession = await prisma.eventSession.findUnique({
		where: {
			id: parsed.eventSessionId
		},
		select: {
			id: true,
			name: true,
			state: true,
			threadId: true,
			startedAt: true,
			endedAt: true
		}
	});
	if (!eventSession) {
		return null;
	}

	const attendeeCount = await prisma.eventParticipantStat.count({
		where: {
			eventSessionId: parsed.eventSessionId
		}
	});

	const totalPages = Math.max(1, Math.ceil(attendeeCount / parsed.pageSize));
	const resolvedPage = Math.min(parsed.page, totalPages);
	const skip = (resolvedPage - 1) * parsed.pageSize;

	const participantRows = await prisma.eventParticipantStat.findMany({
		where: {
			eventSessionId: parsed.eventSessionId
		},
		orderBy: [{ attendedSeconds: 'desc' }, { userId: 'asc' }],
		skip,
		take: parsed.pageSize,
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

	const targetUserIds = participantRows.map((row) => row.userId);
	const decisionRows =
		targetUserIds.length > 0
			? await prisma.eventReviewDecision.findMany({
					where: {
						eventSessionId: parsed.eventSessionId,
						targetUserId: {
							in: targetUserIds
						}
					},
					select: {
						targetUserId: true,
						decision: true
					}
				})
			: [];

	const decisionByUserId = new Map(decisionRows.map((row) => [row.targetUserId, row.decision]));

	return {
		eventSession,
		attendeeCount,
		page: resolvedPage,
		pageSize: parsed.pageSize,
		totalPages,
		attendees: participantRows.map((row) => ({
			dbUserId: row.userId,
			discordUserId: row.user.discordUserId,
			discordUsername: row.user.discordUsername,
			discordNickname: row.user.discordNickname,
			attendedSeconds: row.attendedSeconds,
			decision: decisionByUserId.get(row.userId) ?? null
		}))
	};
}
