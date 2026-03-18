import type { ButtonInteraction, Guild } from 'discord.js';

import type { ExecutionContext } from '../../../../logging/executionContext';
import type {
	ParsedEventReviewButton,
	ParsedEventReviewDecisionAction,
	ParsedEventReviewPageAction,
	ParsedEventReviewSubmitAction
} from './eventReviewButtonProtocol';
import { runFinalizeEventReviewAction } from '../actions/runFinalizeEventReviewAction';
import { runRecordEventReviewDecisionAction } from '../actions/runRecordEventReviewDecisionAction';
import { runRefreshEventReviewPageAction } from '../actions/runRefreshEventReviewPageAction';

type EventReviewButtonRouteParams<TParsed extends ParsedEventReviewButton> = {
	interaction: ButtonInteraction;
	parsedEventReviewButton: TParsed;
	guild: Guild;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
	responder: {
		fail: (content: string, options?: { requestId?: boolean; delivery?: 'auto' | 'reply' | 'editReply' | 'followUp' }) => Promise<void>;
	};
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
};

type EventReviewButtonRouteMap = {
	page: (params: EventReviewButtonRouteParams<ParsedEventReviewPageAction>) => Promise<void>;
	decision: (params: EventReviewButtonRouteParams<ParsedEventReviewDecisionAction>) => Promise<void>;
	submit: (params: EventReviewButtonRouteParams<ParsedEventReviewSubmitAction>) => Promise<void>;
};

const EVENT_REVIEW_BUTTON_ROUTES: EventReviewButtonRouteMap = {
	page: async ({ parsedEventReviewButton, guild, logger, responder }) => {
		const message = await runRefreshEventReviewPageAction({
			parsedEventReviewButton,
			guild,
			logger
		});
		if (message) {
			await responder.fail(message);
		}
	},
	decision: async ({ parsedEventReviewButton, guild, logger, responder, reviewer }) => {
		const message = await runRecordEventReviewDecisionAction({
			parsedEventReviewButton,
			guild,
			logger,
			reviewer
		});
		if (message) {
			await responder.fail(message);
		}
	},
	submit: async ({ parsedEventReviewButton, guild, context, logger, responder, reviewer }) => {
		const { result, message } = await runFinalizeEventReviewAction({
			parsedEventReviewButton,
			guild,
			context,
			logger,
			reviewer
		});
		if (message) {
			await responder.fail(message);
			if (result.kind !== 'review_finalized') {
				return;
			}
		}

		if (result.kind === 'review_finalized') {
			logger.info(
				{
					eventSessionId: parsedEventReviewButton.eventSessionId,
					mode: parsedEventReviewButton.mode,
					awardedCount: result.awardedCount,
					toState: result.toState
				},
				'event.review.finalized'
			);
		}
	}
};

export async function dispatchEventReviewButton(params: EventReviewButtonRouteParams<ParsedEventReviewButton>) {
	const route = EVENT_REVIEW_BUTTON_ROUTES[params.parsedEventReviewButton.action] as (
		params: EventReviewButtonRouteParams<ParsedEventReviewButton>
	) => Promise<void>;
	return route(params);
}
