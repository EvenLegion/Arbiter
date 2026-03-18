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

	return presentRecordEventReviewDecisionResult(result);
}
