import { EventSessionChannelKind } from '@prisma/client';
import type { Guild } from 'discord.js';

import { eventRepository, eventReviewRepository } from '../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../logging/executionContext';
import type { EventLifecycleEventSession } from '../../../services/event-lifecycle/eventLifecycleTypes';
import { syncAwardedMemberNicknamesAndNotifyRankUp } from '../gateways/nicknameRankSyncGateway';
import { syncEventReviewPageMessage } from '../gateways/reviewMessageGateway';
import { syncEventTrackingSummary } from '../gateways/trackingSummaryGateway';
import { postReviewSubmissionTimelineMessages } from '../gateways/timelinePostingGateway';

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
		reloadEventSession: async (eventSessionId: number) =>
			eventRepository.getSession({
				eventSessionId,
				include: {
					hostUser: true,
					eventTier: {
						include: {
							meritType: true
						}
					},
					channels: true,
					eventMessages: true
				}
			}),
		syncTrackingSummary: async (eventSession: EventLifecycleEventSession) => {
			await syncEventTrackingSummary({
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
			syncEventReviewPageMessage({
				guild,
				eventSessionId,
				page,
				logger
			})
	};
}
