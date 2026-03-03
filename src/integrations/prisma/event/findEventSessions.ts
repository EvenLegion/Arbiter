import { type EventSession, type EventSessionState, type Prisma } from '@prisma/client';
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

export async function findManyEventSessions<TInclude extends Prisma.EventSessionInclude | undefined = undefined>({
	eventSessionIds,
	states,
	query = '',
	where,
	include,
	orderBy,
	limit
}: FindManyEventSessionsParams<TInclude> = {}): Promise<FindManyEventSessionsResult<TInclude>> {
	if (eventSessionIds && eventSessionIds.length === 0) {
		return [] as unknown as FindManyEventSessionsResult<TInclude>;
	}

	const derivedWhere = buildEventSessionWhere({
		eventSessionIds,
		states,
		query
	});

	const combinedWhere = combineWhereConditions({
		derivedWhere,
		where
	});

	const sessions = await prisma.eventSession.findMany({
		where: combinedWhere,
		include,
		orderBy,
		...(typeof limit === 'number' ? { take: Math.max(1, Math.floor(limit)) } : {})
	});

	return sessions as FindManyEventSessionsResult<TInclude>;
}

export async function findUniqueEventSession<TInclude extends Prisma.EventSessionInclude | undefined = undefined>({
	eventSessionId,
	include
}: FindUniqueEventSessionParams<TInclude>): Promise<FindUniqueEventSessionResult<TInclude>> {
	const session = await prisma.eventSession.findUnique({
		where: {
			id: eventSessionId
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
