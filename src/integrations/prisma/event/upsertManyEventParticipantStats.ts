import { z } from 'zod';
import { prisma } from '../prisma';

type UpsertManyEventParticipantStatsParams = {
	eventSessionId: number;
	participants: Array<{
		dbUserId: string;
		attendedSeconds: number;
	}>;
};

const UPSERT_MANY_EVENT_PARTICIPANT_STATS_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	participants: z.array(
		z.object({
			dbUserId: z.string().min(1),
			attendedSeconds: z.number().int().nonnegative()
		})
	)
});

export async function upsertManyEventParticipantStats({ eventSessionId, participants }: UpsertManyEventParticipantStatsParams) {
	const parsed = UPSERT_MANY_EVENT_PARTICIPANT_STATS_SCHEMA.parse({
		eventSessionId,
		participants
	});

	if (parsed.participants.length === 0) {
		return;
	}

	await prisma.$transaction(
		parsed.participants.map((participant) =>
			prisma.eventParticipantStat.upsert({
				where: {
					eventSessionId_userId: {
						eventSessionId: parsed.eventSessionId,
						userId: participant.dbUserId
					}
				},
				update: {
					attendedSeconds: participant.attendedSeconds
				},
				create: {
					eventSessionId: parsed.eventSessionId,
					userId: participant.dbUserId,
					attendedSeconds: participant.attendedSeconds
				}
			})
		)
	);
}
