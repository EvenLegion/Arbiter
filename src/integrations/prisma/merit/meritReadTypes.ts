import { z } from 'zod';

export type GetUserMeritSummaryParams = {
	userDbUserId: string;
	page?: number;
	pageSize?: number;
};

export type MeritSummaryEntry = {
	id: number;
	amount: number;
	meritTypeName: string;
	awardedByName: string;
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

export type GetUserTotalMeritsParams = {
	userDbUserId: string;
};

export type GetUsersTotalMeritsParams = {
	userDbUserIds: string[];
};

export type MeritRankBreakdownEntry = {
	level: number;
	lgnOrResCount: number;
	lgnCount: number;
	resCount: number;
	centCount: number;
	optCount: number;
	nvyCount: number;
	nvyLCount: number;
	mrnCount: number;
	mrnLCount: number;
	supCount: number;
	supLCount: number;
};

export const GET_USER_MERIT_SUMMARY_SCHEMA = z.object({
	userDbUserId: z.string().min(1),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().positive().max(10).default(10)
});

export const LINKED_EVENTS_COUNT_ROW_SCHEMA = z.object({
	count: z.union([z.number(), z.bigint(), z.string()]).transform((value) => {
		if (typeof value === 'number') {
			return value;
		}

		if (typeof value === 'bigint') {
			return Number(value);
		}

		return Number.parseInt(value, 10);
	})
});

export const TOTAL_MERITS_ROW_SCHEMA = z.object({
	total: z.union([z.number(), z.bigint(), z.string()]).transform((value) => {
		if (typeof value === 'number') {
			return value;
		}

		if (typeof value === 'bigint') {
			return Number(value);
		}

		return Number.parseInt(value, 10);
	})
});

export const GET_USER_TOTAL_MERITS_SCHEMA = z.object({
	userDbUserId: z.string().min(1)
});

export const GET_USERS_TOTAL_MERITS_SCHEMA = z.object({
	userDbUserIds: z.array(z.string().min(1)).default([])
});

export const USER_TOTAL_ROW_SCHEMA = z.object({
	userId: z.string().min(1),
	total: z.union([z.number(), z.bigint(), z.string()]).transform((value) => {
		if (typeof value === 'number') {
			return value;
		}
		if (typeof value === 'bigint') {
			return Number(value);
		}
		return Number.parseInt(value, 10);
	})
});

const ZERO_ONE_BOOLEAN_SCHEMA = z.union([z.number(), z.bigint(), z.string(), z.boolean()]).transform((value) => {
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'number') {
		return value > 0;
	}
	if (typeof value === 'bigint') {
		return value > 0n;
	}

	return Number.parseInt(value, 10) > 0;
});

export const USER_MERIT_RANK_DIVISION_ROW_SCHEMA = z.object({
	userId: z.string().min(1),
	total: z.union([z.number(), z.bigint(), z.string()]).transform((value) => {
		if (typeof value === 'number') {
			return value;
		}
		if (typeof value === 'bigint') {
			return Number(value);
		}
		return Number.parseInt(value, 10);
	}),
	hasLgn: ZERO_ONE_BOOLEAN_SCHEMA,
	hasRes: ZERO_ONE_BOOLEAN_SCHEMA,
	hasCent: ZERO_ONE_BOOLEAN_SCHEMA,
	hasOpt: ZERO_ONE_BOOLEAN_SCHEMA,
	hasNvy: ZERO_ONE_BOOLEAN_SCHEMA,
	hasNvyL: ZERO_ONE_BOOLEAN_SCHEMA,
	hasMrn: ZERO_ONE_BOOLEAN_SCHEMA,
	hasMrnL: ZERO_ONE_BOOLEAN_SCHEMA,
	hasSup: ZERO_ONE_BOOLEAN_SCHEMA,
	hasSupL: ZERO_ONE_BOOLEAN_SCHEMA
});
