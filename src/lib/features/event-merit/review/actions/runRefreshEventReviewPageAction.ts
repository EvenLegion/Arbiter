import type { Guild } from 'discord.js';

import { eventReviewRepository } from '../../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../../logging/executionContext';
import { refreshEventReviewPage } from '../../../../services/event-review/eventReviewService';
import { syncEventReviewPresentation } from '../../presentation/syncEventReviewPresentation';
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
	logger.info(
		{
			eventSessionId: parsedEventReviewButton.eventSessionId,
			page: parsedEventReviewButton.page
		},
		'event.review.page.refresh.started'
	);

	const pageResult = await refreshEventReviewPage(
		{
			getReviewPage: async ({ eventSessionId, page }: { eventSessionId: number; page: number }) =>
				eventReviewRepository.getReviewPage({
					eventSessionId,
					page
				}),
			syncReviewMessage: async ({ eventSessionId, page }: { eventSessionId: number; page: number }) =>
				syncEventReviewPresentation({
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

	if (pageResult.kind === 'page_refreshed') {
		if (pageResult.synced) {
			logger.info(
				{
					eventSessionId: parsedEventReviewButton.eventSessionId,
					page: parsedEventReviewButton.page
				},
				'event.review.page.refresh.completed'
			);
		} else {
			logger.warn(
				{
					eventSessionId: parsedEventReviewButton.eventSessionId,
					page: parsedEventReviewButton.page
				},
				'event.review.page.refresh.sync_failed'
			);
		}
	} else {
		logger.info(
			{
				eventSessionId: parsedEventReviewButton.eventSessionId,
				page: parsedEventReviewButton.page,
				resultKind: pageResult.kind,
				...('currentState' in pageResult ? { currentState: pageResult.currentState } : {})
			},
			'event.review.page.refresh.rejected'
		);
	}

	return presentRefreshEventReviewPageResult(pageResult);
}
