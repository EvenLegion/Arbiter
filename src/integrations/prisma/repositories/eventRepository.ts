import type { EventSessionState, Prisma } from '@prisma/client';

import { createDraftEventSession } from '../event/session/createDraftEventSession';
import { deleteManyEventSessionChannels } from '../event/session/deleteManyEventSessionChannels';
import { findManyEventSessionMessages } from '../event/session/findManyEventSessionMessages';
import { findManyEventSessions, findUniqueEventSession } from '../event/session/findEventSessions';
import { findManyReservedEventVoiceChannelIds } from '../event/session/findManyReservedEventVoiceChannelIds';
import { findReservedEventVoiceChannelReservation } from '../event/session/findReservedEventVoiceChannelReservation';
import { updateEventSessionState } from '../event/session/updateEventSessionState';
import { upsertEventSessionChannel } from '../event/session/upsertEventSessionChannel';
import { upsertEventSessionMessageRef } from '../event/session/upsertEventSessionMessageRef';
import { findFirstEventTier, findManyEventTiers } from '../event/tier/findEventTiers';

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
