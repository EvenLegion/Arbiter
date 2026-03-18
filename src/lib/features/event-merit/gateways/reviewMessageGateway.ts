import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { syncEventReviewPresentation } from '../presentation/syncEventReviewPresentation';

export async function syncEventReviewPageMessage({
	guild,
	eventSessionId,
	page,
	logger
}: {
	guild: Guild;
	eventSessionId: number;
	page: number;
	logger: ExecutionContext['logger'];
}) {
	return syncEventReviewPresentation({
		guild,
		eventSessionId,
		page,
		logger
	});
}
