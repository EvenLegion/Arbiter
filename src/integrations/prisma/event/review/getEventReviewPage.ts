import { EventSessionState } from '@prisma/client';
import { z } from 'zod';

import {
	type EventReviewPageAttendee,
	findEventReviewDecisionRows,
	findEventReviewParticipantRows,
	mapEventReviewAttendees,
	resolveEventReviewPageBounds,
	resolveEventReviewPageSize
} from './eventReviewPageHelpers';
import { prisma } from '../../prisma';

type GetEventReviewPageParams = {
	eventSessionId: number;
	page?: number;
	pageSize?: number;
};

export type { EventReviewPageAttendee } from './eventReviewPageHelpers';

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
	pageSize: z.number().int().positive().max(25).optional()
});

export async function getEventReviewPage({ eventSessionId, page = 1, pageSize }: GetEventReviewPageParams): Promise<EventReviewPage | null> {
	const parsed = GET_EVENT_REVIEW_PAGE_SCHEMA.parse({
		eventSessionId,
		page,
		pageSize
	});

	const eventSession = await prisma.event.findUnique({
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
	const resolvedPageSize = resolvePageSize({
		eventState: eventSession.state,
		pageSize
	});

	const attendeeCount = await prisma.eventParticipantStat.count({
		where: {
			eventSessionId: parsed.eventSessionId
		}
	});

	const { totalPages, resolvedPage, skip } = resolveEventReviewPageBounds({
		page: parsed.page,
		pageSize: resolvedPageSize,
		attendeeCount
	});
	const participantRows = await findEventReviewParticipantRows({
		eventSessionId: parsed.eventSessionId,
		skip,
		pageSize: resolvedPageSize
	});
	const decisionRows = await findEventReviewDecisionRows({
		eventSessionId: parsed.eventSessionId,
		targetUserIds: participantRows.map((row) => row.userId)
	});

	return {
		eventSession,
		attendeeCount,
		page: resolvedPage,
		pageSize: resolvedPageSize,
		totalPages,
		attendees: mapEventReviewAttendees({
			participantRows,
			decisionRows
		})
	};
}

function resolvePageSize({ eventState, pageSize }: { eventState: EventSessionState; pageSize: number | undefined }) {
	return resolveEventReviewPageSize({
		eventState,
		pageSize
	});
}
