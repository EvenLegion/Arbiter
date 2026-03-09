import type { Prisma } from '@prisma/client';
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

const CANONICAL_MERIT_TYPE_CODE_BY_AMOUNT = new Map<number, string>([
	[-1, 'DEMERIT'],
	[0, 'TIER_0'],
	[1, 'COMMANDER_MERIT'],
	[2, 'TIER_2'],
	[3, 'TIER_3'],
	[4, 'TESSERARIUS_MERIT']
]);

export async function awardManualMerit(params: AwardManualMeritParams) {
	const parsed = AWARD_MANUAL_MERIT_SCHEMA.parse(params);

	return prisma.$transaction(async (tx) => {
		const meritTypeId = await resolveMeritTypeId({
			tx,
			amount: parsed.amount,
			eventSessionId: parsed.eventSessionId ?? null
		});

		return tx.merit.create({
			data: {
				userId: parsed.recipientDbUserId,
				awardedByUserId: parsed.awardedByDbUserId,
				meritTypeId,
				reason: parsed.reason ?? null,
				eventSessionId: parsed.eventSessionId ?? null
			}
		});
	});
}

async function resolveMeritTypeId({ tx, amount, eventSessionId }: { tx: Prisma.TransactionClient; amount: number; eventSessionId: number | null }) {
	if (eventSessionId) {
		const eventSession = await tx.eventSession.findUnique({
			where: {
				id: eventSessionId
			},
			select: {
				eventTier: {
					select: {
						meritTypeId: true,
						meritType: {
							select: {
								meritAmount: true
							}
						}
					}
				}
			}
		});
		if (eventSession && eventSession.eventTier.meritType.meritAmount === amount) {
			return eventSession.eventTier.meritTypeId;
		}
	}

	const canonicalMeritTypeCode = CANONICAL_MERIT_TYPE_CODE_BY_AMOUNT.get(amount);
	if (canonicalMeritTypeCode) {
		const canonicalMeritType = await tx.meritType.findUnique({
			where: {
				code: canonicalMeritTypeCode
			},
			select: {
				id: true
			}
		});
		if (canonicalMeritType) {
			return canonicalMeritType.id;
		}
	}

	const customMeritType = await tx.meritType.upsert({
		where: {
			code: buildCustomMeritTypeCode(amount)
		},
		update: {
			name: buildCustomMeritTypeName(amount),
			description: `Custom manual merit type (${amount})`,
			meritAmount: amount
		},
		create: {
			code: buildCustomMeritTypeCode(amount),
			name: buildCustomMeritTypeName(amount),
			description: `Custom manual merit type (${amount})`,
			meritAmount: amount
		},
		select: {
			id: true
		}
	});

	return customMeritType.id;
}

function buildCustomMeritTypeName(amount: number) {
	const signPrefix = amount >= 0 ? '+' : '';
	return `Custom Merit ${signPrefix}${amount}`;
}

function buildCustomMeritTypeCode(amount: number) {
	return amount >= 0 ? `CUSTOM_P${amount}` : `CUSTOM_N${Math.abs(amount)}`;
}
