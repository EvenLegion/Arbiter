import { EventSessionState } from '@prisma/client';
import { z } from 'zod';

const EVENT_SESSION_STATE_SCHEMA = z.enum(EventSessionState);

const FIND_MANY_EVENT_SESSIONS_SCHEMA = z.object({
	eventSessionIds: z.array(z.number().int().positive()).optional(),
	states: z.array(EVENT_SESSION_STATE_SCHEMA).optional(),
	query: z.string().default(''),
	limit: z.number().int().positive().optional()
});

const FIND_UNIQUE_EVENT_SESSION_SCHEMA = z.object({
	eventSessionId: z.number().int().positive()
});

export function parseFindManyEventSessionsInput(input: { eventSessionIds?: number[]; states?: EventSessionState[]; query?: string; limit?: number }) {
	return FIND_MANY_EVENT_SESSIONS_SCHEMA.parse(input);
}

export function parseFindUniqueEventSessionInput(input: { eventSessionId: number }) {
	return FIND_UNIQUE_EVENT_SESSION_SCHEMA.parse(input);
}
