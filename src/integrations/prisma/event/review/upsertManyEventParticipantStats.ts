import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../prisma';

export type UpsertManyEventParticipantStatsParams = {
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

export async function upsertManyEventParticipantStats(
	{ eventSessionId, participants }: UpsertManyEventParticipantStatsParams,
	client: Pick<Prisma.TransactionClient, '$executeRaw'> = prisma
) {
	const parsed = UPSERT_MANY_EVENT_PARTICIPANT_STATS_SCHEMA.parse({
		eventSessionId,
		participants
	});

	if (parsed.participants.length === 0) {
		return;
	}

	// Preserve the previous last-write-wins behavior for duplicate input users.
	const unique = [...new Map(parsed.participants.map((participant) => [participant.dbUserId, participant])).values()];
	// One parameterized statement, not one network round trip per attendee. The
	// entire snapshot succeeds or rolls back, including foreign-key failures.
	await client.$executeRaw(Prisma.sql`
  INSERT INTO "EventParticipantStat" ("eventSessionId", "userId", "attendedSeconds", "createdAt", "updatedAt")
  VALUES ${Prisma.join(unique.map((participant) => Prisma.sql`(${parsed.eventSessionId}, ${participant.dbUserId}, ${participant.attendedSeconds}, NOW(), NOW())`))}
  ON CONFLICT ("eventSessionId", "userId") DO UPDATE
  SET "attendedSeconds" = EXCLUDED."attendedSeconds", "updatedAt" = NOW()
 `);
}
