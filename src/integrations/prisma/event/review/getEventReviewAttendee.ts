import { z } from 'zod';

import type { EventReviewPageAttendee } from './eventReviewPageHelpers';
import { prisma } from '../../prisma';

type GetEventReviewAttendeeParams = {
	eventSessionId: number;
	targetDbUserId: string;
};

const GET_EVENT_REVIEW_ATTENDEE_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	targetDbUserId: z.string().min(1)
});

export async function getEventReviewAttendee({
	eventSessionId,
	targetDbUserId
}: GetEventReviewAttendeeParams): Promise<EventReviewPageAttendee | null> {
	const parsed = GET_EVENT_REVIEW_ATTENDEE_SCHEMA.parse({
		eventSessionId,
		targetDbUserId
	});

	const [participantRow, decisionRow] = await Promise.all([
		prisma.eventParticipantStat.findUnique({
			where: {
				eventSessionId_userId: {
					eventSessionId: parsed.eventSessionId,
					userId: parsed.targetDbUserId
				}
			},
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
		}),
		prisma.eventReviewDecision.findUnique({
			where: {
				eventSessionId_targetUserId: {
					eventSessionId: parsed.eventSessionId,
					targetUserId: parsed.targetDbUserId
				}
			},
			select: {
				decision: true
			}
		})
	]);

	if (!participantRow) {
		return null;
	}

	return {
		dbUserId: participantRow.userId,
		discordUserId: participantRow.user.discordUserId,
		discordUsername: participantRow.user.discordUsername,
		discordNickname: participantRow.user.discordNickname,
		attendedSeconds: participantRow.attendedSeconds,
		decision: decisionRow?.decision ?? null
	};
}
