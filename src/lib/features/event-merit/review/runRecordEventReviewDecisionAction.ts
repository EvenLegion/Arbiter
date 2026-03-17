import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { recordEventReviewDecision } from '../../../services/event-review/eventReviewService';
import { presentRecordEventReviewDecisionResult } from './eventReviewActionResultPresenter';
import type { ParsedEventReviewDecisionAction } from './eventReviewButtonTypes';
import { createRecordEventReviewDecisionDeps } from './eventReviewServiceAdapters';

export async function runRecordEventReviewDecisionAction({
	parsedEventReviewButton,
	guild,
	logger,
	reviewer
}: {
	parsedEventReviewButton: ParsedEventReviewDecisionAction;
	guild: Guild;
	logger: ExecutionContext['logger'];
	reviewer: {
		actor: {
			discordUserId: string;
			dbUserId: string | null;
			capabilities: {
				isStaff: boolean;
				isCenturion: boolean;
			};
			discordTag?: string;
		};
	};
}) {
	const result = await recordEventReviewDecision(
		createRecordEventReviewDecisionDeps({
			guild,
			logger
		}),
		{
			actor: reviewer.actor,
			eventSessionId: parsedEventReviewButton.eventSessionId,
			targetDbUserId: parsedEventReviewButton.targetDbUserId,
			decision: parsedEventReviewButton.decision,
			page: parsedEventReviewButton.page
		}
	);

	return presentRecordEventReviewDecisionResult(result);
}
