import { EventSessionChannelKind, EventSessionMessageKind } from '@prisma/client';

import { eventRepository } from '../../../../integrations/prisma/repositories';

export function createEventDraftRepositoryGateway() {
	return {
		findEventTier: async (eventTierId: number) =>
			eventRepository.getEventTierById({
				where: {
					id: eventTierId
				}
			}),
		createDraftEventSession: async (params: {
			hostDbUserId: string;
			eventTierId: number;
			threadId: string;
			name: string;
			primaryChannelId: string;
			addedByDbUserId: string;
		}) => eventRepository.createDraftSession(params),
		saveEventThreadChannel: async ({
			eventSessionId,
			threadId,
			addedByDbUserId
		}: {
			eventSessionId: number;
			threadId: string;
			addedByDbUserId: string;
		}) => {
			await eventRepository.upsertSessionChannel({
				eventSessionId,
				channelId: threadId,
				kind: EventSessionChannelKind.EVENT_THREAD,
				addedByDbUserId
			});
		},
		saveTrackingMessageRef: async ({
			eventSessionId,
			channelId,
			messageId
		}: {
			eventSessionId: number;
			channelId: string;
			messageId: string;
		}) => {
			await eventRepository.upsertSessionMessageRef({
				eventSessionId,
				kind: EventSessionMessageKind.TRACKING_SUMMARY,
				channelId,
				messageId
			});
		},
		saveParentVoiceSummaryMessageRef: async ({
			eventSessionId,
			channelId,
			messageId
		}: {
			eventSessionId: number;
			channelId: string;
			messageId: string;
		}) => {
			await eventRepository.upsertSessionMessageRef({
				eventSessionId,
				kind: EventSessionMessageKind.TRACKING_SUMMARY_PARENT_VC,
				channelId,
				messageId
			});
		}
	};
}
