import { z } from 'zod';

import { createCustomIdCodec, joinCustomId } from '../../../discord/customId';
import type { ParsedEventReviewPageAction } from './eventReviewButtonTypes';

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();
const PAGE_SCHEMA = z.coerce.number().int().positive();

const EVENT_REVIEW_PAGE_BUTTON_CODEC = createCustomIdCodec<
	ParsedEventReviewPageAction,
	{
		eventSessionId: number;
		page: number;
		source: 'prev' | 'next';
	}
>({
	prefix: ['event', 'review', 'page'],
	parseParts: ([rawEventSessionId, rawPage, rawSource]) => {
		if (rawSource && rawSource !== 'prev' && rawSource !== 'next') {
			return null;
		}

		const parsedEventSessionId = EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSessionId);
		if (!parsedEventSessionId.success) {
			return null;
		}

		const parsedPage = PAGE_SCHEMA.safeParse(rawPage);
		if (!parsedPage.success) {
			return null;
		}

		return {
			action: 'page',
			eventSessionId: parsedEventSessionId.data,
			page: parsedPage.data
		};
	},
	buildParts: ({ eventSessionId, page, source }) => [eventSessionId, page, source]
});

export function parseEventReviewPageButton(customId: string): ParsedEventReviewPageAction | null {
	return EVENT_REVIEW_PAGE_BUTTON_CODEC.parse(customId);
}

export function buildEventReviewPageButtonId({ eventSessionId, page, source }: { eventSessionId: number; page: number; source: 'prev' | 'next' }) {
	return EVENT_REVIEW_PAGE_BUTTON_CODEC.build({
		eventSessionId,
		page,
		source
	});
}

export function buildEventReviewPageIndicatorButtonId({ eventSessionId, page }: { eventSessionId: number; page: number }) {
	return joinCustomId(['event', 'review', 'page-indicator', eventSessionId, page]);
}
