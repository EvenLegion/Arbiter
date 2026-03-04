import { EventSessionMessageKind, EventSessionState } from '@prisma/client';
import type { Guild } from 'discord.js';
import {
	getEventReviewPage,
	findManyEventSessionMessages,
	findUniqueEventSession,
	upsertEventSessionMessageRef
} from '../../../../integrations/prisma';
import { buildEventReviewPayload } from './buildEventReviewPayload';
import { EVENT_REVIEW_FINALIZED_PAGE_SIZE, EVENT_REVIEW_PAGE_SIZE } from './constants';

type SyncEventReviewMessageParams = {
	guild: Guild;
	eventSessionId: number;
	page?: number;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
};

export async function syncEventReviewMessage({ guild, eventSessionId, page = 1, logger }: SyncEventReviewMessageParams) {
	const eventSessionState = await findUniqueEventSession({
		eventSessionId
	}).then((session) => session?.state ?? null);
	if (!eventSessionState) {
		return false;
	}

	const pageSize = eventSessionState === EventSessionState.ENDED_PENDING_REVIEW ? EVENT_REVIEW_PAGE_SIZE : EVENT_REVIEW_FINALIZED_PAGE_SIZE;

	const reviewPage = await getEventReviewPage({
		eventSessionId,
		page,
		pageSize
	});
	if (!reviewPage) {
		return false;
	}

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

	const durationSeconds = computeDurationSeconds(reviewPage.eventSession.startedAt, reviewPage.eventSession.endedAt);
	const payload = buildEventReviewPayload({
		eventSessionId: reviewPage.eventSession.id,
		eventName: reviewPage.eventSession.name,
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
			await findManyEventSessionMessages({
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

	await upsertEventSessionMessageRef({
		eventSessionId: reviewPage.eventSession.id,
		kind: EventSessionMessageKind.REVIEW,
		channelId: reviewMessage.channelId,
		messageId: reviewMessage.id
	});

	return true;
}

function computeDurationSeconds(startedAt: Date | null, endedAt: Date | null) {
	if (!startedAt || !endedAt) {
		return 0;
	}

	return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
}
