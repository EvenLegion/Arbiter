import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../../../logging/executionContext';
import type { ActorContext } from '../../../../services/_shared/actor';
import { finalizeEventReviewLifecycle } from '../../../../services/event-lifecycle';
import { createFinalizeEventReviewLifecycleDeps } from './createFinalizeEventReviewLifecycleDeps';
import { presentFinalizeEventReviewResult } from './eventReviewActionResultPresenter';
import type { ParsedEventReviewSubmitAction } from '../buttons/eventReviewButtonProtocol';

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
		actor: ActorContext;
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
