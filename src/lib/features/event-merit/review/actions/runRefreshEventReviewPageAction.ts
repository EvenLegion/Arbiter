import type { Guild } from 'discord.js';

import { eventReviewRepository } from '../../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../../logging/executionContext';
import { refreshEventReviewPage } from '../../../../services/event-review/eventReviewService';
import { syncEventReviewPageMessage } from '../../gateways/reviewMessageGateway';
import { presentRefreshEventReviewPageResult } from './eventReviewActionResultPresenter';
import type { ParsedEventReviewPageAction } from '../buttons/eventReviewButtonProtocol';

export async function runRefreshEventReviewPageAction({
	parsedEventReviewButton,
	guild,
	logger
}: {
	parsedEventReviewButton: ParsedEventReviewPageAction;
	guild: Guild;
	logger: ExecutionContext['logger'];
}) {
	const pageResult = await refreshEventReviewPage(
		{
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
		},
		{
			eventSessionId: parsedEventReviewButton.eventSessionId,
			page: parsedEventReviewButton.page
		}
	);

	return presentRefreshEventReviewPageResult(pageResult);
}
