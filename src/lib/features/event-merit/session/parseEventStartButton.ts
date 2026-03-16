import { z } from 'zod';

import { createCustomIdCodec } from '../../../discord/customId';

type EventStartButtonAction = 'confirm' | 'cancel' | 'end';

export type ParsedEventStartButton = {
	action: EventStartButtonAction;
	eventSessionId: number;
};

type ParseEventStartButtonParams = {
	customId: string;
};

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();

export function parseEventStartButton({ customId }: ParseEventStartButtonParams): ParsedEventStartButton | null {
	return EVENT_START_BUTTON_CODEC.parse(customId);
}

export function buildEventStartButtonId({ action, eventSessionId }: { action: EventStartButtonAction; eventSessionId: number }) {
	return EVENT_START_BUTTON_CODEC.build({
		action,
		eventSessionId
	});
}

const EVENT_START_BUTTON_CODEC = createCustomIdCodec<ParsedEventStartButton>({
	prefix: ['event', 'start'],
	parseParts: ([rawAction, rawEventSessionId]) => {
		if (rawAction !== 'confirm' && rawAction !== 'cancel' && rawAction !== 'end') {
			return null;
		}

		const parsedEventSessionId = EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSessionId);
		if (!parsedEventSessionId.success) {
			return null;
		}

		return {
			action: rawAction,
			eventSessionId: parsedEventSessionId.data
		};
	},
	buildParts: ({ action, eventSessionId }) => [action, eventSessionId]
});
