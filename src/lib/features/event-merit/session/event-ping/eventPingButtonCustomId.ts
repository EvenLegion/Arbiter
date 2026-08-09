import { z } from 'zod';

import { createCustomIdCodec } from '../../../../discord/interactions/customId';

export type ParsedEventPingButton = {
	action: 'send';
	eventSessionId: number;
};

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();

const EVENT_PING_BUTTON_CODEC = createCustomIdCodec<ParsedEventPingButton>({
	prefix: ['event', 'ping', 'v1'],
	parseParts: ([rawAction, rawEventSessionId]) => {
		if (rawAction !== 'send') {
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

export function parseEventPingButtonCustomId(customId: string) {
	return EVENT_PING_BUTTON_CODEC.parse(customId);
}

export function buildEventPingButtonCustomId(eventSessionId: number) {
	return EVENT_PING_BUTTON_CODEC.build({
		action: 'send',
		eventSessionId
	});
}
