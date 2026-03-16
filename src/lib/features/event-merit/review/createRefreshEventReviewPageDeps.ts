import type { Guild } from 'discord.js';

import { eventReviewRepository } from '../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../logging/executionContext';
import { syncEventReviewPageMessage } from '../gateways/reviewMessageGateway';

export function createRefreshEventReviewPageDeps({ guild, logger }: { guild: Guild; logger: ExecutionContext['logger'] }) {
	return {
		getReviewPage: async ({ eventSessionId, page }: { eventSessionId: number; page: number }) =>
			eventReviewRepository.getReviewPage({
				eventSessionId,
				page
			}),
		syncReviewMessage: async ({ eventSessionId, page }: { eventSessionId: number; page: number }) =>
			syncEventReviewPageMessage({
				guild,
				eventSessionId,
				page,
				logger
			})
	};
}
