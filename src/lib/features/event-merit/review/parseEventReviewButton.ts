import { EventReviewDecisionKind } from '@prisma/client';
import { z } from 'zod';

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
	const [scope, domain, action, ...rest] = customId.split(':');
	if (scope !== 'event' || domain !== 'review') {
		return null;
	}

	if (action === 'page') {
		const [rawEventSessionId, rawPage] = rest;
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
	}

	if (action === 'submit') {
		const [rawMode, rawEventSessionId] = rest;
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
	}

	if (action !== 'decision') {
		return null;
	}

	const [rawEventSessionId, rawTargetDbUserId, rawDecisionCode, rawPage] = rest;
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
