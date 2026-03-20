import { z } from 'zod';

import { createCustomIdCodec, joinCustomId } from '../../../../discord/interactions/customId';

export type ParsedEventReviewPageAction = {
	action: 'page';
	eventSessionId: number;
	page: number;
};

export type ParsedEventReviewSubmitAction = {
	action: 'submit';
	eventSessionId: number;
	mode: 'with' | 'without';
};

export type ParsedEventReviewDecisionAction = {
	action: 'decision';
	eventSessionId: number;
	targetDbUserId: string;
	page: number;
};

export type ParsedEventReviewButton = ParsedEventReviewPageAction | ParsedEventReviewSubmitAction | ParsedEventReviewDecisionAction;

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();
const PAGE_SCHEMA = z.coerce.number().int().positive();
const TARGET_DB_USER_ID_SCHEMA = z.string().min(1);

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

const EVENT_REVIEW_SUBMIT_BUTTON_CODEC = createCustomIdCodec<
	ParsedEventReviewSubmitAction,
	{
		eventSessionId: number;
		mode: 'with' | 'without';
	}
>({
	prefix: ['event', 'review', 'submit'],
	parseParts: ([rawMode, rawEventSessionId]) => {
		if (rawMode !== 'with' && rawMode !== 'without') {
			return null;
		}

		const parsedEventSessionId = EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSessionId);
		if (!parsedEventSessionId.success) {
			return null;
		}

		return {
			action: 'submit',
			eventSessionId: parsedEventSessionId.data,
			mode: rawMode
		};
	},
	buildParts: ({ eventSessionId, mode }) => [mode, eventSessionId]
});

const EVENT_REVIEW_DECISION_BUTTON_CODEC = createCustomIdCodec<
	ParsedEventReviewDecisionAction,
	{
		eventSessionId: number;
		targetDbUserId: string;
		page: number;
	}
>({
	prefix: ['event', 'review', 'decision'],
	parseParts: ([rawEventSessionId, rawTargetDbUserId, rawPage]) => {
		const parsedEventSessionId = EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSessionId);
		if (!parsedEventSessionId.success) {
			return null;
		}

		const parsedTargetDbUserId = TARGET_DB_USER_ID_SCHEMA.safeParse(rawTargetDbUserId);
		if (!parsedTargetDbUserId.success) {
			return null;
		}

		const parsedPage = PAGE_SCHEMA.safeParse(rawPage);
		if (!parsedPage.success) {
			return null;
		}

		return {
			action: 'decision',
			eventSessionId: parsedEventSessionId.data,
			targetDbUserId: parsedTargetDbUserId.data,
			page: parsedPage.data
		};
	},
	buildParts: ({ eventSessionId, targetDbUserId, page }) => [eventSessionId, targetDbUserId, page]
});

export function parseEventReviewButtonCustomId(customId: string): ParsedEventReviewButton | null {
	return parseEventReviewPageButton(customId) ?? parseEventReviewSubmitButton(customId) ?? parseEventReviewDecisionButton(customId);
}

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

export function parseEventReviewSubmitButton(customId: string): ParsedEventReviewSubmitAction | null {
	return EVENT_REVIEW_SUBMIT_BUTTON_CODEC.parse(customId);
}

export function buildEventReviewSubmitButtonId({ eventSessionId, mode }: { eventSessionId: number; mode: 'with' | 'without' }) {
	return EVENT_REVIEW_SUBMIT_BUTTON_CODEC.build({
		eventSessionId,
		mode
	});
}

export function parseEventReviewDecisionButton(customId: string): ParsedEventReviewDecisionAction | null {
	return EVENT_REVIEW_DECISION_BUTTON_CODEC.parse(customId);
}

export function buildEventReviewDecisionButtonId({
	eventSessionId,
	targetDbUserId,
	page
}: {
	eventSessionId: number;
	targetDbUserId: string;
	page: number;
}) {
	return EVENT_REVIEW_DECISION_BUTTON_CODEC.build({
		eventSessionId,
		targetDbUserId,
		page
	});
}
