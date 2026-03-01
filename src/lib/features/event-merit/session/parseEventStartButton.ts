import { z } from 'zod';

type EventStartButtonAction = 'confirm' | 'cancel';

export type ParsedEventStartButton = {
	action: EventStartButtonAction;
	eventSessionId: number;
};

type ParseEventStartButtonParams = {
	customId: string;
};

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();

export function parseEventStartButton({ customId }: ParseEventStartButtonParams): ParsedEventStartButton | null {
	const [scope, domain, action, rawEventSessionId] = customId.split(':');
	if (scope !== 'event' || domain !== 'start') {
		return null;
	}

	if (action !== 'confirm' && action !== 'cancel') {
		return null;
	}

	const parsedEventSessionId = EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSessionId);
	if (!parsedEventSessionId.success) {
		return null;
	}

	return {
		action,
		eventSessionId: parsedEventSessionId.data
	};
}
