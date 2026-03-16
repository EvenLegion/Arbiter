import { EventReviewDecisionKind } from '@prisma/client';
import { z } from 'zod';

import { createCustomIdCodec, joinCustomId } from '../../../discord/customId';

export type ParsedEventReviewButton =
	| {
			action: 'page';
			eventSessionId: number;
			page: number;
	  }
	| {
			action: 'submit';
			eventSessionId: number;
			mode: 'with' | 'without';
	  }
	| {
			action: 'decision';
			eventSessionId: number;
			targetDbUserId: string;
			decision: EventReviewDecisionKind;
			page: number;
	  };

type ParseEventReviewButtonParams = {
	customId: string;
};

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();
const PAGE_SCHEMA = z.coerce.number().int().positive();
const TARGET_DB_USER_ID_SCHEMA = z.string().min(1);

export function parseEventReviewButton({ customId }: ParseEventReviewButtonParams): ParsedEventReviewButton | null {
	return (
		EVENT_REVIEW_PAGE_BUTTON_CODEC.parse(customId) ??
		EVENT_REVIEW_SUBMIT_BUTTON_CODEC.parse(customId) ??
		EVENT_REVIEW_DECISION_BUTTON_CODEC.parse(customId)
	);
}

export function buildEventReviewSubmitButtonId({ eventSessionId, mode }: { eventSessionId: number; mode: 'with' | 'without' }) {
	return EVENT_REVIEW_SUBMIT_BUTTON_CODEC.build({
		eventSessionId,
		mode
	});
}

export function buildEventReviewDecisionButtonId({
	eventSessionId,
	targetDbUserId,
	decisionCode,
	page
}: {
	eventSessionId: number;
	targetDbUserId: string;
	decisionCode: 'm' | 'n';
	page: number;
}) {
	return EVENT_REVIEW_DECISION_BUTTON_CODEC.build({
		eventSessionId,
		targetDbUserId,
		decisionCode,
		page
	});
}

export function buildEventReviewAttendeeLabelButtonId({
	eventSessionId,
	targetDbUserId,
	page
}: {
	eventSessionId: number;
	targetDbUserId: string;
	page: number;
}) {
	return joinCustomId(['event', 'review', 'attendee', eventSessionId, targetDbUserId, page]);
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

const EVENT_REVIEW_PAGE_BUTTON_CODEC = createCustomIdCodec<
	Extract<ParsedEventReviewButton, { action: 'page' }>,
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
	Extract<ParsedEventReviewButton, { action: 'submit' }>,
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
	Extract<ParsedEventReviewButton, { action: 'decision' }>,
	{
		eventSessionId: number;
		targetDbUserId: string;
		decisionCode: 'm' | 'n';
		page: number;
	}
>({
	prefix: ['event', 'review', 'decision'],
	parseParts: ([rawEventSessionId, rawTargetDbUserId, rawDecisionCode, rawPage]) => {
		const parsedEventSessionId = EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSessionId);
		if (!parsedEventSessionId.success) {
			return null;
		}

		const parsedTargetDbUserId = TARGET_DB_USER_ID_SCHEMA.safeParse(rawTargetDbUserId);
		if (!parsedTargetDbUserId.success) {
			return null;
		}

		const decision = parseDecisionCode(rawDecisionCode);
		if (!decision) {
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
			decision,
			page: parsedPage.data
		};
	},
	buildParts: ({ eventSessionId, targetDbUserId, decisionCode, page }) => [eventSessionId, targetDbUserId, decisionCode, page]
});

function parseDecisionCode(value: string | undefined): EventReviewDecisionKind | null {
	if (value === 'm') {
		return EventReviewDecisionKind.MERIT;
	}

	if (value === 'n') {
		return EventReviewDecisionKind.NO_MERIT;
	}

	return null;
}
