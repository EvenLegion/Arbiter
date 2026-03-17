import { EventReviewDecisionKind } from '@prisma/client';
import { z } from 'zod';

import { createCustomIdCodec, joinCustomId } from '../../../discord/customId';
import type { ParsedEventReviewDecisionAction } from './eventReviewButtonTypes';

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();
const PAGE_SCHEMA = z.coerce.number().int().positive();
const TARGET_DB_USER_ID_SCHEMA = z.string().min(1);

const EVENT_REVIEW_DECISION_BUTTON_CODEC = createCustomIdCodec<
	ParsedEventReviewDecisionAction,
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

export function parseEventReviewDecisionButton(customId: string): ParsedEventReviewDecisionAction | null {
	return EVENT_REVIEW_DECISION_BUTTON_CODEC.parse(customId);
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

function parseDecisionCode(value: string | undefined): EventReviewDecisionKind | null {
	if (value === 'm') {
		return EventReviewDecisionKind.MERIT;
	}

	if (value === 'n') {
		return EventReviewDecisionKind.NO_MERIT;
	}

	return null;
}
