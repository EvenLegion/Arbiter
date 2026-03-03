import { EventSessionState, type EventSession, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';

type EventSessionFilters = {
	eventSessionIds?: number[];
	states?: EventSessionState[];
	query?: string;
	where?: Prisma.EventSessionWhereInput;
};

type FindManyEventSessionsParams<TInclude extends Prisma.EventSessionInclude | undefined = undefined> = EventSessionFilters & {
	include?: TInclude;
	orderBy?: Prisma.EventSessionOrderByWithRelationInput[];
	limit?: number;
};

type FindManyEventSessionsResult<TInclude extends Prisma.EventSessionInclude | undefined> = TInclude extends Prisma.EventSessionInclude
	? Prisma.EventSessionGetPayload<{ include: TInclude }>[]
	: EventSession[];

type FindUniqueEventSessionParams<TInclude extends Prisma.EventSessionInclude | undefined = undefined> = {
	eventSessionId: number;
	include?: TInclude;
};

type FindUniqueEventSessionResult<TInclude extends Prisma.EventSessionInclude | undefined> = TInclude extends Prisma.EventSessionInclude
	? Prisma.EventSessionGetPayload<{ include: TInclude }> | null
	: EventSession | null;

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

export async function findManyEventSessions<TInclude extends Prisma.EventSessionInclude | undefined = undefined>({
	eventSessionIds,
	states,
	query = '',
	where,
	include,
	orderBy,
	limit
}: FindManyEventSessionsParams<TInclude> = {}): Promise<FindManyEventSessionsResult<TInclude>> {
	const parsed = FIND_MANY_EVENT_SESSIONS_SCHEMA.parse({
		eventSessionIds,
		states,
		query,
		limit
	});
	if (parsed.eventSessionIds && parsed.eventSessionIds.length === 0) {
		return [] as unknown as FindManyEventSessionsResult<TInclude>;
	}

	const derivedWhere = buildEventSessionWhere({
		eventSessionIds: parsed.eventSessionIds,
		states: parsed.states,
		query: parsed.query
	});

	const combinedWhere = combineWhereConditions({
		derivedWhere,
		where
	});

	const sessions = await prisma.eventSession.findMany({
		where: combinedWhere,
		include,
		orderBy,
		...(typeof parsed.limit === 'number' ? { take: Math.max(1, Math.floor(parsed.limit)) } : {})
	});

	return sessions as FindManyEventSessionsResult<TInclude>;
}

export async function findUniqueEventSession<TInclude extends Prisma.EventSessionInclude | undefined = undefined>({
	eventSessionId,
	include
}: FindUniqueEventSessionParams<TInclude>): Promise<FindUniqueEventSessionResult<TInclude>> {
	const parsed = FIND_UNIQUE_EVENT_SESSION_SCHEMA.parse({
		eventSessionId
	});

	const session = await prisma.eventSession.findUnique({
		where: {
			id: parsed.eventSessionId
		},
		include
	});

	return session as FindUniqueEventSessionResult<TInclude>;
}

function buildEventSessionWhere({ eventSessionIds, states, query = '' }: Omit<EventSessionFilters, 'where'>): Prisma.EventSessionWhereInput {
	const trimmedQuery = query.trim();

	return {
		...(eventSessionIds ? { id: { in: eventSessionIds } } : {}),
		...(states && states.length > 0 ? { state: { in: states } } : {}),
		...(trimmedQuery.length > 0
			? {
					OR: [
						{
							name: {
								contains: trimmedQuery,
								mode: 'insensitive'
							}
						},
						{
							eventTier: {
								name: {
									contains: trimmedQuery,
									mode: 'insensitive'
								}
							}
						}
					]
				}
			: {})
	};
}

function combineWhereConditions({
	derivedWhere,
	where
}: {
	derivedWhere: Prisma.EventSessionWhereInput;
	where?: Prisma.EventSessionWhereInput;
}): Prisma.EventSessionWhereInput | undefined {
	if (!where) {
		return derivedWhere;
	}

	return {
		AND: [derivedWhere, where]
	};
}
