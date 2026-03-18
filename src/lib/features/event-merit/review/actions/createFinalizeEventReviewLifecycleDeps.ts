import { EventSessionChannelKind } from '@prisma/client';
import type { Guild } from 'discord.js';

import { eventRepository, eventReviewRepository } from '../../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../../logging/executionContext';
import type { EventLifecycleEventSession } from '../../../../services/event-lifecycle/eventLifecycleService';
import { syncAwardedMemberNicknamesAndNotifyRankUp } from '../../gateways/nicknameRankSyncGateway';
import { postReviewSubmissionTimelineMessages } from '../../gateways/postReviewSubmissionTimelineMessages';
import { syncEventReviewPresentation } from '../../presentation/syncEventReviewPresentation';
import { syncEventTrackingSummaryPresentation } from '../../presentation/syncEventTrackingPresentation';
import { EVENT_LIFECYCLE_SESSION_INCLUDE } from '../../session/shared/eventLifecycleSessionInclude';

export function createFinalizeEventReviewLifecycleDeps({
	guild,
	context,
	logger
}: {
	guild: Guild;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	return {
		findEventSession: async (eventSessionId: number) =>
			eventRepository.getSession({
				eventSessionId
			}),
		finalizeReview: async (params: { eventSessionId: number; reviewerDbUserId: string; mode: 'with' | 'without' }) =>
			eventReviewRepository.finalizeReview(params),
		syncAwardedNicknames: async ({
			awardedUsers,
			awardedMeritAmount
		}: {
			awardedUsers: Array<{
				dbUserId: string;
				discordUserId: string;
			}>;
			awardedMeritAmount: number;
		}) => {
			await syncAwardedMemberNicknamesAndNotifyRankUp({
				guild,
				awardedUsers,
				awardedMeritAmount,
				context,
				logger
			});
		},
		reloadEventSession: (eventSessionId: number) =>
			eventRepository.getSession({
				eventSessionId,
				include: EVENT_LIFECYCLE_SESSION_INCLUDE
			}),
		syncTrackingSummary: async (eventSession: EventLifecycleEventSession) => {
			await syncEventTrackingSummaryPresentation({
				guild,
				eventSession,
				logger
			});
		},
		postReviewSubmissionMessages: async ({
			eventSession,
			actorDiscordUserId,
			mode
		}: {
			eventSession: EventLifecycleEventSession;
			actorDiscordUserId: string;
			mode: 'with' | 'without';
		}) =>
			postReviewSubmissionTimelineMessages({
				guild,
				eventSession,
				actorDiscordUserId,
				mode,
				logger
			}),
		deleteTrackedChannelRows: async (eventSessionId: number) =>
			eventRepository.deleteSessionChannels({
				eventSessionId,
				kinds: [EventSessionChannelKind.PARENT_VC, EventSessionChannelKind.CHILD_VC]
			}),
		syncReviewMessage: async ({ eventSessionId, page }: { eventSessionId: number; page: number }) =>
			syncEventReviewPresentation({
				guild,
				eventSessionId,
				page,
				logger
			})
	};
}
