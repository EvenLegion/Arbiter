import { eventRepository, eventReviewRepository, userRepository } from '../../../../integrations/prisma/repositories';
import { ENV_DISCORD } from '../../../../config/env/discord';
import type { ExecutionContext } from '../../../logging/executionContext';
import { syncEventReviewPageMessage } from '../gateways/reviewMessageGateway';
import { clearEventTrackingSession, getEventTrackingParticipantsSnapshot } from '../gateways/trackingStoreGateway';

export function createInitializeEventReviewStateDeps({ guild, logger }: { guild: import('discord.js').Guild; logger: ExecutionContext['logger'] }) {
	return {
		findEventSession: async (eventSessionId: number) =>
			eventRepository.getSession({
				eventSessionId
			}),
		getTrackingParticipantsSnapshot: async (eventSessionId: number) =>
			getEventTrackingParticipantsSnapshot({
				eventSessionId
			}),
		findUsersByDiscordUserIds: async (discordUserIds: string[]) =>
			discordUserIds.length === 0
				? []
				: userRepository
						.list({
							discordUserIds
						})
						.then((users) =>
							users.map((user) => ({
								id: user.id,
								discordUserId: user.discordUserId
							}))
						),
		upsertParticipantStats: async (params: {
			eventSessionId: number;
			participants: Array<{
				dbUserId: string;
				attendedSeconds: number;
			}>;
		}) => {
			await eventReviewRepository.upsertParticipantStats(params);
		},
		upsertReviewDecisions: async (params: {
			eventSessionId: number;
			decisions: Array<{
				targetDbUserId: string;
				decision: 'MERIT' | 'NO_MERIT';
			}>;
			overwriteExisting: boolean;
		}) => {
			await eventReviewRepository.upsertReviewDecisions(params);
		},
		clearTrackingSession: async (eventSessionId: number) => {
			await clearEventTrackingSession({
				eventSessionId
			});
		},
		syncReviewMessage: async ({ eventSessionId, page }: { eventSessionId: number; page: number }) =>
			syncEventReviewPageMessage({
				guild,
				eventSessionId,
				page,
				logger
			}),
		defaultMinAttendancePercent: ENV_DISCORD.EVENT_MERIT_DEFAULT_MIN_ATTENDANCE_PCT
	};
}
