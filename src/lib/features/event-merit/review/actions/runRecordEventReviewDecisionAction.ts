import { EventReviewDecisionKind } from '@prisma/client';
import type { Guild } from 'discord.js';

import { ENV_DISCORD } from '../../../../../config/env/discord';
import { eventRepository, eventReviewRepository } from '../../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../../logging/executionContext';
import type { ActorContext } from '../../../../services/_shared/actor';
import { computeEventDurationSeconds } from '../../../../services/event-lifecycle';
import { recordEventReviewDecision } from '../../../../services/event-review/eventReviewService';
import { resolveEventReviewDecision } from '../presentation/eventReviewPresentationModel';
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
		actor: ActorContext;
	};
}) {
	const currentAttendee = await eventReviewRepository.getReviewAttendee({
		eventSessionId: parsedEventReviewButton.eventSessionId,
		targetDbUserId: parsedEventReviewButton.targetDbUserId
	});

	if (!currentAttendee) {
		logger.warn(
			{
				eventSessionId: parsedEventReviewButton.eventSessionId,
				page: parsedEventReviewButton.page,
				targetDbUserId: parsedEventReviewButton.targetDbUserId
			},
			'event.review.decision.target_missing'
		);
		return 'Could not resolve the current attendee review state. Please refresh the review page and try again.';
	}

	const eventSession = await eventRepository.getSession({
		eventSessionId: parsedEventReviewButton.eventSessionId
	});
	if (!eventSession) {
		return presentRecordEventReviewDecisionResult({
			kind: 'event_not_found'
		});
	}

	const currentDecision = resolveEventReviewDecision({
		decision: currentAttendee.decision,
		attendedSeconds: currentAttendee.attendedSeconds,
		durationSeconds: computeEventDurationSeconds({
			startedAt: eventSession.startedAt,
			endedAt: eventSession.endedAt
		}),
		defaultMinAttendancePct: ENV_DISCORD.EVENT_MERIT_DEFAULT_MIN_ATTENDANCE_PCT,
		fullAttendanceGraceSeconds: ENV_DISCORD.EVENT_TRACKING_INTERVAL_SECONDS
	});
	const nextDecision = currentDecision === EventReviewDecisionKind.MERIT ? EventReviewDecisionKind.NO_MERIT : EventReviewDecisionKind.MERIT;

	logger.info(
		{
			eventSessionId: parsedEventReviewButton.eventSessionId,
			page: parsedEventReviewButton.page,
			targetDbUserId: parsedEventReviewButton.targetDbUserId,
			currentDecision,
			decision: nextDecision,
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
			decision: nextDecision,
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
					decision: nextDecision
				},
				'event.review.decision.completed'
			);
		} else {
			logger.warn(
				{
					eventSessionId: parsedEventReviewButton.eventSessionId,
					page: parsedEventReviewButton.page,
					targetDbUserId: parsedEventReviewButton.targetDbUserId,
					decision: nextDecision
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
				decision: nextDecision,
				resultKind: result.kind,
				...('currentState' in result ? { currentState: result.currentState } : {})
			},
			'event.review.decision.rejected'
		);
	}

	return presentRecordEventReviewDecisionResult(result);
}
