import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { syncEventReviewMessage } from '../review/syncEventReviewMessage';

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
	return syncEventReviewMessage({
		guild,
		eventSessionId,
		page,
		logger
	});
}
