import type { Guild } from 'discord.js';

import { eventRepository, eventReviewRepository } from '../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../logging/executionContext';
import { syncEventReviewPageMessage } from '../gateways/reviewMessageGateway';

export function createRecordEventReviewDecisionDeps({ guild, logger }: { guild: Guild; logger: ExecutionContext['logger'] }) {
	return {
		findEventSession: async (eventSessionId: number) =>
			eventRepository.getSession({
				eventSessionId
			}),
		saveDecision: async (params: { eventSessionId: number; targetDbUserId: string; decision: 'MERIT' | 'NO_MERIT' }) => {
			await eventReviewRepository.upsertDecision(params);
		},
		syncReviewMessage: async ({ eventSessionId, page }: { eventSessionId: number; page: number }) =>
			syncEventReviewPageMessage({
				guild,
				eventSessionId,
				page,
				logger
			})
	};
}
