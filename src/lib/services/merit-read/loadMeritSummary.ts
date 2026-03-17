import { buildEmptyMeritSummary } from './buildEmptyMeritSummary';
import type { MeritReadServiceDeps } from './meritReadTypes';

export async function loadMeritSummary({
	deps,
	discordUserId,
	page,
	pageSize
}: {
	deps: MeritReadServiceDeps;
	discordUserId: string;
	page: number;
	pageSize: number;
}) {
	const targetDbUser = await deps.getUser({
		discordUserId
	});
	if (!targetDbUser) {
		return buildEmptyMeritSummary({
			page,
			pageSize
		});
	}

	return deps.getUserMeritSummary({
		userDbUserId: targetDbUser.id,
		page,
		pageSize
	});
}
