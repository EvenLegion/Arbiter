import type { EventSessionState, Prisma } from '@prisma/client';

import {
	createDraftEventSession,
	deleteManyEventSessionChannels,
	findManyEventSessionMessages,
	findManyEventSessions,
	findManyReservedEventVoiceChannelIds,
	findReservedEventVoiceChannelReservation,
	findUniqueEventSession,
	updateEventSessionState,
	upsertEventSessionChannel,
	upsertEventSessionMessageRef
} from '../event/eventSessionQueries';
import { findFirstEventTier, findManyEventTiers } from '../event/eventTierQueries';

export async function listEventSessions<TInclude extends Prisma.EventInclude | undefined = undefined>(params?: {
	eventSessionIds?: number[];
	states?: EventSessionState[];
	query?: string;
	where?: Prisma.EventWhereInput;
	include?: TInclude;
	orderBy?: Prisma.EventOrderByWithRelationInput[];
	limit?: number;
}) {
	return findManyEventSessions<TInclude>(params);
}

export async function getEventSession<TInclude extends Prisma.EventInclude | undefined = undefined>(params: {
	eventSessionId: number;
	include?: TInclude;
}) {
	return findUniqueEventSession<TInclude>(params);
}

export const eventRepository = {
	listSessions: listEventSessions,
	getSession: getEventSession,
	listEventTiers: findManyEventTiers,
	getEventTierById: findFirstEventTier,
	createDraftSession: createDraftEventSession,
	listSessionMessages: findManyEventSessionMessages,
	listReservedVoiceChannelIds: findManyReservedEventVoiceChannelIds,
	getReservedVoiceChannelReservation: findReservedEventVoiceChannelReservation,
	updateSessionState: updateEventSessionState,
	upsertSessionChannel: upsertEventSessionChannel,
	upsertSessionMessageRef: upsertEventSessionMessageRef,
	deleteSessionChannels: deleteManyEventSessionChannels
};
