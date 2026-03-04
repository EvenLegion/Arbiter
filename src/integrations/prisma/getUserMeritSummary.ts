import { z } from 'zod';
import { prisma } from './prisma';

type GetUserMeritSummaryParams = {
	userDbUserId: string;
	page?: number;
	pageSize?: number;
};

export type MeritSummaryEntry = {
	id: number;
	amount: number;
	reason: string | null;
	createdAt: Date;
	eventSession: {
		id: number;
		name: string;
	} | null;
};

export type UserMeritSummary = {
	totalMerits: number;
	totalAwards: number;
	totalLinkedEvents: number;
	page: number;
	pageSize: number;
	totalPages: number;
	entries: MeritSummaryEntry[];
};

const GET_USER_MERIT_SUMMARY_SCHEMA = z.object({
	userDbUserId: z.string().min(1),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().positive().max(10).default(10)
});

export async function getUserMeritSummary({ userDbUserId, page = 1, pageSize = 10 }: GetUserMeritSummaryParams): Promise<UserMeritSummary> {
	const parsed = GET_USER_MERIT_SUMMARY_SCHEMA.parse({
		userDbUserId,
		page,
		pageSize
	});

	return prisma.$transaction(async (tx) => {
		const aggregate = await tx.merit.aggregate({
			where: {
				userId: parsed.userDbUserId
			},
			_sum: {
				amount: true
			}
		});
		const totalAwards = await tx.merit.count({
			where: {
				userId: parsed.userDbUserId
			}
		});
		const linkedEventRows = await tx.merit.findMany({
			where: {
				userId: parsed.userDbUserId,
				eventSessionId: {
					not: null
				}
			},
			select: {
				eventSessionId: true
			},
			distinct: ['eventSessionId']
		});

		const totalPages = Math.max(1, Math.ceil(totalAwards / parsed.pageSize));
		const resolvedPage = Math.min(parsed.page, totalPages);
		const skip = (resolvedPage - 1) * parsed.pageSize;

		const entries = await tx.merit.findMany({
			where: {
				userId: parsed.userDbUserId
			},
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			skip,
			take: parsed.pageSize,
			select: {
				id: true,
				amount: true,
				reason: true,
				createdAt: true,
				eventSession: {
					select: {
						id: true,
						name: true
					}
				}
			}
		});

		return {
			totalMerits: aggregate._sum.amount ?? 0,
			totalAwards,
			totalLinkedEvents: linkedEventRows.length,
			page: resolvedPage,
			pageSize: parsed.pageSize,
			totalPages,
			entries
		};
	});
}
