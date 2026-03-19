import type { Guild } from 'discord.js';

import { eventRepository, eventReviewRepository } from '../../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../../logging/executionContext';
import { recordEventReviewDecision } from '../../../../services/event-review/eventReviewService';
import { syncEventReviewPresentation } from '../../presentation/syncEventReviewPresentation';
import { presentRecordEventReviewDecisionResult } from './eventReviewActionResultPresenter';
import type { ParsedEventReviewDecisionAction } from '../buttons/eventReviewButtonProtocol';

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
	logger.info(
		{
			eventSessionId: parsedEventReviewButton.eventSessionId,
			page: parsedEventReviewButton.page,
			targetDbUserId: parsedEventReviewButton.targetDbUserId,
			decision: parsedEventReviewButton.decision,
			reviewerDiscordUserId: reviewer.actor.discordUserId
		},
		'event.review.decision.started'
	);

	const result = await recordEventReviewDecision(
		{
			findEventSession: async (eventSessionId: number) =>
				eventRepository.getSession({
					eventSessionId
				}),
			saveDecision: async (params: { eventSessionId: number; targetDbUserId: string; decision: 'MERIT' | 'NO_MERIT' }) => {
				await eventReviewRepository.upsertDecision(params);
			},
			syncReviewMessage: async ({ eventSessionId, page }: { eventSessionId: number; page: number }) =>
				syncEventReviewPresentation({
					guild,
					eventSessionId,
					page,
					logger
				})
		},
		{
			actor: reviewer.actor,
			eventSessionId: parsedEventReviewButton.eventSessionId,
			targetDbUserId: parsedEventReviewButton.targetDbUserId,
			decision: parsedEventReviewButton.decision,
			page: parsedEventReviewButton.page
		}
	);

	if (result.kind === 'decision_saved') {
		if (result.synced) {
			logger.info(
				{
					eventSessionId: parsedEventReviewButton.eventSessionId,
					page: parsedEventReviewButton.page,
					targetDbUserId: parsedEventReviewButton.targetDbUserId,
					decision: parsedEventReviewButton.decision
				},
				'event.review.decision.completed'
			);
		} else {
			logger.warn(
				{
					eventSessionId: parsedEventReviewButton.eventSessionId,
					page: parsedEventReviewButton.page,
					targetDbUserId: parsedEventReviewButton.targetDbUserId,
					decision: parsedEventReviewButton.decision
				},
				'event.review.decision.sync_failed'
			);
		}
	} else {
		logger.info(
			{
				eventSessionId: parsedEventReviewButton.eventSessionId,
				page: parsedEventReviewButton.page,
				targetDbUserId: parsedEventReviewButton.targetDbUserId,
				decision: parsedEventReviewButton.decision,
				resultKind: result.kind,
				...('currentState' in result ? { currentState: result.currentState } : {})
			},
			'event.review.decision.rejected'
		);
	}

	return presentRecordEventReviewDecisionResult(result);
}
