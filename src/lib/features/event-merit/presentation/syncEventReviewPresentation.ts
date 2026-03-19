import { EventSessionMessageKind } from '@prisma/client';
import type { Guild } from 'discord.js';

import { eventRepository, eventReviewRepository } from '../../../../integrations/prisma/repositories';
import { computeEventDurationSeconds } from '../../../services/event-lifecycle';
import { loadEventReviewPage } from '../../../services/event-review/eventReviewService';
import { buildEventReviewPayload } from '../review/presentation/buildEventReviewPayload';
import { editReferencedMessage, resolveSendCapableGuildChannel, sendMessageToChannel } from './eventDiscordMessageGateway';

export async function syncEventReviewPresentation({
	guild,
	eventSessionId,
	page = 1,
	logger
}: {
	guild: Guild;
	eventSessionId: number;
	page?: number;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
}) {
	const reviewPageResult = await loadEventReviewPage(
		{
			getReviewPage: async ({ eventSessionId: lookupEventSessionId, page: reviewPageNumber }) =>
				eventReviewRepository.getReviewPage({
					eventSessionId: lookupEventSessionId,
					page: reviewPageNumber
				})
		},
		{
			eventSessionId,
			page
		}
	);
	if (reviewPageResult.kind !== 'page_ready') {
		return false;
	}
	const reviewPage = reviewPageResult.reviewPage;
	const durationSeconds = computeEventDurationSeconds({
		startedAt: reviewPage.eventSession.startedAt,
		endedAt: reviewPage.eventSession.endedAt
	});
	const payload = buildEventReviewPayload({
		eventSessionId: reviewPage.eventSession.id,
		state: reviewPage.eventSession.state,
		durationSeconds,
		attendeeCount: reviewPage.attendeeCount,
		page: reviewPage.page,
		totalPages: reviewPage.totalPages,
		attendees: reviewPage.attendees,
		pageSize: reviewPage.pageSize
	});

	const existingReviewRef =
		(
			await eventRepository.listSessionMessages({
				eventSessionId: reviewPage.eventSession.id,
				kinds: [EventSessionMessageKind.REVIEW]
			})
		)[0] ?? null;

	let reviewMessage = null;
	if (existingReviewRef) {
		reviewMessage = await editReferencedMessage({
			guild,
			channelId: existingReviewRef.channelId,
			messageId: existingReviewRef.messageId,
			payload,
			logger,
			failureLogMessage: 'Failed to edit existing event review message',
			logBindings: {
				eventSessionId: reviewPage.eventSession.id
			}
		});
	}

	if (!reviewMessage) {
		const threadChannel = await resolveSendCapableGuildChannel({
			guild,
			channelId: reviewPage.eventSession.threadId
		});
		if (!threadChannel) {
			logger.warn(
				{
					eventSessionId,
					threadId: reviewPage.eventSession.threadId
				},
				'Cannot sync event review message because tracking thread is missing or not send-capable'
			);
			return false;
		}

		reviewMessage = await sendMessageToChannel({
			channel: threadChannel,
			payload,
			logger,
			failureLogMessage: 'Failed to post event review message',
			logBindings: {
				eventSessionId: reviewPage.eventSession.id,
				threadId: reviewPage.eventSession.threadId
			}
		});
	}

	if (!reviewMessage) {
		return false;
	}

	await eventRepository.upsertSessionMessageRef({
		eventSessionId: reviewPage.eventSession.id,
		kind: EventSessionMessageKind.REVIEW,
		channelId: reviewMessage.channelId,
		messageId: reviewMessage.id
	});

	return true;
}
