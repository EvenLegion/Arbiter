import { z } from 'zod';
import { prisma } from './prisma';

type GetUserTotalMeritsParams = {
	userDbUserId: string;
};

const GET_USER_TOTAL_MERITS_SCHEMA = z.object({
	userDbUserId: z.string().min(1)
});

export async function getUserTotalMerits(params: GetUserTotalMeritsParams): Promise<number> {
	const parsed = GET_USER_TOTAL_MERITS_SCHEMA.parse(params);

	const aggregate = await prisma.merit.aggregate({
		where: {
			userId: parsed.userDbUserId
		},
		_sum: {
			amount: true
		}
	});

	return aggregate._sum.amount ?? 0;
}
