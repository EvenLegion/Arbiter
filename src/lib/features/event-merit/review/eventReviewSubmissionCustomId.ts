import { z } from 'zod';

import { createCustomIdCodec } from '../../../discord/customId';
import type { ParsedEventReviewSubmitAction } from './eventReviewButtonTypes';

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();

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

export function parseEventReviewSubmitButton(customId: string): ParsedEventReviewSubmitAction | null {
	return EVENT_REVIEW_SUBMIT_BUTTON_CODEC.parse(customId);
}

export function buildEventReviewSubmitButtonId({ eventSessionId, mode }: { eventSessionId: number; mode: 'with' | 'without' }) {
	return EVENT_REVIEW_SUBMIT_BUTTON_CODEC.build({
		eventSessionId,
		mode
	});
}
