import { MeritTypeCode } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../prisma';

type AwardManualMeritParams = {
	recipientDbUserId: string;
	awardedByDbUserId: string;
	meritTypeCode: MeritTypeCode;
	reason?: string | null;
	eventSessionId?: number | null;
};

export class MeritTypeNotManualAwardableError extends Error {
	public constructor(public readonly meritTypeCode: MeritTypeCode) {
		super(`Merit type ${meritTypeCode} is not manual-awardable.`);
		this.name = 'MeritTypeNotManualAwardableError';
	}
}

const AWARD_MANUAL_MERIT_SCHEMA = z.object({
	recipientDbUserId: z.string().min(1),
	awardedByDbUserId: z.string().min(1),
	meritTypeCode: z.enum(MeritTypeCode),
	reason: z.string().trim().min(1).max(500).nullable().optional(),
	eventSessionId: z.number().int().positive().nullable().optional()
});

export async function awardManualMerit(params: AwardManualMeritParams) {
	const parsed = AWARD_MANUAL_MERIT_SCHEMA.parse(params);

	return prisma.$transaction(async (tx) => {
		const meritType = await tx.meritType.findUnique({
			where: {
				code: parsed.meritTypeCode
			},
			select: {
				id: true,
				isManualAwardable: true
			}
		});
		if (!meritType) {
			throw new Error(`MeritType not seeded for code: ${parsed.meritTypeCode}`);
		}
		if (!meritType.isManualAwardable) {
			throw new MeritTypeNotManualAwardableError(parsed.meritTypeCode);
		}

		return tx.merit.create({
			data: {
				userId: parsed.recipientDbUserId,
				awardedByUserId: parsed.awardedByDbUserId,
				meritTypeId: meritType.id,
				reason: parsed.reason ?? null,
				eventSessionId: parsed.eventSessionId ?? null
			},
			include: {
				meritType: {
					select: {
						code: true,
						name: true,
						meritAmount: true
					}
				}
			}
		});
	});
}
