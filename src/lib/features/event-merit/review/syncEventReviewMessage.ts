import { EventSessionMessageKind } from '@prisma/client';
import type { Guild } from 'discord.js';
import { eventRepository, eventReviewRepository } from '../../../../integrations/prisma/repositories';
import { buildEventReviewPayload } from './buildEventReviewPayload';
import { computeEventDurationSeconds } from './computeEventDurationSeconds';
import { loadEventReviewPage } from '../../../services/event-review/eventReviewService';

type SyncEventReviewMessageParams = {
	guild: Guild;
	eventSessionId: number;
	page?: number;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
};

export async function syncEventReviewMessage({ guild, eventSessionId, page = 1, logger }: SyncEventReviewMessageParams) {
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

	const threadChannel =
		guild.channels.cache.get(reviewPage.eventSession.threadId) ??
		(await guild.channels.fetch(reviewPage.eventSession.threadId).catch(() => null));
	if (!threadChannel || !threadChannel.isTextBased()) {
		logger.warn(
			{
				eventSessionId,
				threadId: reviewPage.eventSession.threadId
			},
			'Cannot sync event review message because tracking thread is missing or not text-based'
		);
		return false;
	}

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

	let reviewMessage: import('discord.js').Message | null = null;

	if (existingReviewRef) {
		const existingChannel =
			guild.channels.cache.get(existingReviewRef.channelId) ?? (await guild.channels.fetch(existingReviewRef.channelId).catch(() => null));
		if (existingChannel && existingChannel.isTextBased()) {
			reviewMessage = await existingChannel.messages
				.fetch(existingReviewRef.messageId)
				.then((message) =>
					message.edit({
						content: null,
						...payload
					})
				)
				.catch(() => null);
		}
	}

	if (!reviewMessage) {
		reviewMessage = await threadChannel.send(payload).catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					eventSessionId: reviewPage.eventSession.id,
					threadId: reviewPage.eventSession.threadId
				},
				'Failed to post event review message'
			);
			return null;
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
