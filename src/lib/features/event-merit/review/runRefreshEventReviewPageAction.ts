import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { refreshEventReviewPage } from '../../../services/event-review/eventReviewService';
import { presentRefreshEventReviewPageResult } from './eventReviewActionResultPresenter';
import type { ParsedEventReviewPageAction } from './eventReviewButtonTypes';
import { createRefreshEventReviewPageDeps } from './eventReviewServiceAdapters';

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
		createRefreshEventReviewPageDeps({
			guild,
			logger
		}),
		{
			eventSessionId: parsedEventReviewButton.eventSessionId,
			page: parsedEventReviewButton.page
		}
	);

	return presentRefreshEventReviewPageResult(pageResult);
}
