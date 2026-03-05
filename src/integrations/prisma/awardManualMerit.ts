import { MeritSource } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';

type AwardManualMeritParams = {
	recipientDbUserId: string;
	awardedByDbUserId: string;
	amount: number;
	reason?: string | null;
	eventSessionId?: number | null;
};

const AWARD_MANUAL_MERIT_SCHEMA = z.object({
	recipientDbUserId: z.string().min(1),
	awardedByDbUserId: z.string().min(1),
	amount: z.number().int().positive(),
	reason: z.string().trim().min(1).max(500).nullable().optional(),
	eventSessionId: z.number().int().positive().nullable().optional()
});

export async function awardManualMerit(params: AwardManualMeritParams) {
	const parsed = AWARD_MANUAL_MERIT_SCHEMA.parse(params);

	if (parsed.eventSessionId) {
		return prisma.merit.upsert({
			where: {
				eventSessionId_userId_source: {
					eventSessionId: parsed.eventSessionId,
					userId: parsed.recipientDbUserId,
					source: MeritSource.MANUAL
				}
			},
			create: {
				userId: parsed.recipientDbUserId,
				awardedByUserId: parsed.awardedByDbUserId,
				amount: parsed.amount,
				source: MeritSource.MANUAL,
				reason: parsed.reason ?? null,
				eventSessionId: parsed.eventSessionId
			},
			update: {
				amount: {
					increment: parsed.amount
				},
				awardedByUserId: parsed.awardedByDbUserId,
				...(parsed.reason ? { reason: parsed.reason } : {})
			}
		});
	}

	return prisma.merit.create({
		data: {
			userId: parsed.recipientDbUserId,
			awardedByUserId: parsed.awardedByDbUserId,
			amount: parsed.amount,
			source: MeritSource.MANUAL,
			reason: parsed.reason ?? null
		}
	});
}
