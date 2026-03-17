import type { UserMeritSummary } from '../../../integrations/prisma/repositories';

export function buildEmptyMeritSummary({ page, pageSize }: { page: number; pageSize: number }): UserMeritSummary {
	return {
		totalMerits: 0,
		totalAwards: 0,
		totalLinkedEvents: 0,
		page,
		pageSize,
		totalPages: 1,
		entries: []
	};
}
