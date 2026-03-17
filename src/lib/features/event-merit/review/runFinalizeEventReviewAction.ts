import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { finalizeEventReviewLifecycle } from '../../../services/event-lifecycle/eventLifecycleService';
import { presentFinalizeEventReviewResult } from './eventReviewActionResultPresenter';
import type { ParsedEventReviewSubmitAction } from './eventReviewButtonTypes';
import { createFinalizeEventReviewLifecycleDeps } from './eventReviewServiceAdapters';

export async function runFinalizeEventReviewAction({
	parsedEventReviewButton,
	guild,
	context,
	logger,
	reviewer
}: {
	parsedEventReviewButton: ParsedEventReviewSubmitAction;
	guild: Guild;
	context: ExecutionContext;
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
	const result = await finalizeEventReviewLifecycle(
		createFinalizeEventReviewLifecycleDeps({
			guild,
			context,
			logger
		}),
		{
			actor: reviewer.actor,
			eventSessionId: parsedEventReviewButton.eventSessionId,
			mode: parsedEventReviewButton.mode
		}
	);

	return {
		result,
		message: presentFinalizeEventReviewResult(result)
	};
}
