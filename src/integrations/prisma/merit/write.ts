import { MeritTypeCode, type Prisma } from '@prisma/client';
import { z } from 'zod';

import { MeritEligibilityError, type ResolveMeritEligibility } from '../../../lib/services/merit-eligibility/meritEligibility';
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

export async function awardManualMerit(params: AwardManualMeritParams & { resolveMeritEligibility: ResolveMeritEligibility }) {
	const parsed = AWARD_MANUAL_MERIT_SCHEMA.parse(params);

	const candidateType = await findManualMeritType(prisma, parsed.meritTypeCode);
	let verifiedDiscordUserId: string | undefined;
	if (candidateType.meritAmount > 0) {
		const recipient = await prisma.user.findUniqueOrThrow({ where: { id: parsed.recipientDbUserId }, select: { discordUserId: true } });
		// Discord latency/rate-limit queues must not consume an interactive DB transaction.
		const eligibility = await params.resolveMeritEligibility(recipient.discordUserId);
		if (eligibility !== 'eligible') throw new MeritEligibilityError(eligibility);
		verifiedDiscordUserId = recipient.discordUserId;
	}

	return prisma.$transaction(async (tx) => {
		const meritType = await findManualMeritType(tx, parsed.meritTypeCode);
		if (meritType.meritAmount > 0) {
			const recipient = await tx.user.findUniqueOrThrow({ where: { id: parsed.recipientDbUserId }, select: { discordUserId: true } });
			if (recipient.discordUserId !== verifiedDiscordUserId) throw new MeritEligibilityError('unavailable');
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

async function findManualMeritType(client: Pick<Prisma.TransactionClient, 'meritType'>, meritTypeCode: MeritTypeCode) {
	const meritType = await client.meritType.findUnique({
		where: { code: meritTypeCode },
		select: { id: true, isManualAwardable: true, meritAmount: true }
	});
	if (!meritType) throw new Error(`MeritType not seeded for code: ${meritTypeCode}`);
	if (!meritType.isManualAwardable) throw new MeritTypeNotManualAwardableError(meritTypeCode);
	return meritType;
}
