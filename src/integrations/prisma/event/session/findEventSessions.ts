import type { Event, EventSessionState, Prisma } from '@prisma/client';

import { combineWhereConditions } from '../combineWhereConditions';
import { buildEventSessionWhere } from './buildEventSessionWhere';
import { parseFindManyEventSessionsInput, parseFindUniqueEventSessionInput } from './eventSessionQuerySchemas';
import { prisma } from '../../prisma';

type EventSessionFilters = {
	eventSessionIds?: number[];
	states?: EventSessionState[];
	query?: string;
	where?: Prisma.EventWhereInput;
};

type FindManyEventSessionsParams<TInclude extends Prisma.EventInclude | undefined = undefined> = EventSessionFilters & {
	include?: TInclude;
	orderBy?: Prisma.EventOrderByWithRelationInput[];
	limit?: number;
};

type FindManyEventSessionsResult<TInclude extends Prisma.EventInclude | undefined> = TInclude extends Prisma.EventInclude
	? Prisma.EventGetPayload<{ include: TInclude }>[]
	: Event[];

type FindUniqueEventSessionParams<TInclude extends Prisma.EventInclude | undefined = undefined> = {
	eventSessionId: number;
	include?: TInclude;
};

type FindUniqueEventSessionResult<TInclude extends Prisma.EventInclude | undefined> = TInclude extends Prisma.EventInclude
	? Prisma.EventGetPayload<{ include: TInclude }> | null
	: Event | null;

export async function findManyEventSessions<TInclude extends Prisma.EventInclude | undefined = undefined>({
	eventSessionIds,
	states,
	query = '',
	where,
	include,
	orderBy,
	limit
}: FindManyEventSessionsParams<TInclude> = {}): Promise<FindManyEventSessionsResult<TInclude>> {
	const parsed = parseFindManyEventSessionsInput({
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

	const sessions = await prisma.event.findMany({
		where: combinedWhere,
		include,
		orderBy,
		...(typeof parsed.limit === 'number' ? { take: Math.max(1, Math.floor(parsed.limit)) } : {})
	});

	return sessions as FindManyEventSessionsResult<TInclude>;
}

export async function findUniqueEventSession<TInclude extends Prisma.EventInclude | undefined = undefined>({
	eventSessionId,
	include
}: FindUniqueEventSessionParams<TInclude>): Promise<FindUniqueEventSessionResult<TInclude>> {
	const parsed = parseFindUniqueEventSessionInput({
		eventSessionId
	});

	const session = await prisma.event.findUnique({
		where: {
			id: parsed.eventSessionId
		},
		include
	});

	return session as FindUniqueEventSessionResult<TInclude>;
}
