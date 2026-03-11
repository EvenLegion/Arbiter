import { EventSessionState, type Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../prisma';

const EVENT_SESSION_STATE_SCHEMA = z.enum(EventSessionState);
const FROM_STATE_SCHEMA = z.union([EVENT_SESSION_STATE_SCHEMA, z.array(EVENT_SESSION_STATE_SCHEMA).nonempty()]);
const BASE_TRANSITION_SCHEMA = z.object({
	eventSessionId: z.number().int().positive(),
	fromState: FROM_STATE_SCHEMA
});

const ALLOWED_TRANSITIONS: Record<EventSessionState, EventSessionState[]> = {
	[EventSessionState.DRAFT]: [EventSessionState.ACTIVE, EventSessionState.CANCELLED],
	[EventSessionState.CANCELLED]: [],
	[EventSessionState.ACTIVE]: [EventSessionState.ENDED_PENDING_REVIEW],
	[EventSessionState.ENDED_PENDING_REVIEW]: [EventSessionState.FINALIZED_WITH_MERITS, EventSessionState.FINALIZED_NO_MERITS],
	[EventSessionState.FINALIZED_WITH_MERITS]: [],
	[EventSessionState.FINALIZED_NO_MERITS]: []
};

const UPDATE_EVENT_SESSION_STATE_SCHEMA = z
	.discriminatedUnion('toState', [
		BASE_TRANSITION_SCHEMA.extend({
			toState: z.literal(EventSessionState.ACTIVE),
			data: z
				.object({
					startedAt: z.date()
				})
				.strict()
		}),
		BASE_TRANSITION_SCHEMA.extend({
			toState: z.literal(EventSessionState.CANCELLED),
			data: z.undefined().optional()
		}),
		BASE_TRANSITION_SCHEMA.extend({
			toState: z.literal(EventSessionState.ENDED_PENDING_REVIEW),
			data: z
				.object({
					endedAt: z.date()
				})
				.strict()
		}),
		BASE_TRANSITION_SCHEMA.extend({
			toState: z.literal(EventSessionState.FINALIZED_WITH_MERITS),
			data: z
				.object({
					reviewFinalizedAt: z.date(),
					reviewFinalizedByUserId: z.string().min(1)
				})
				.strict()
		}),
		BASE_TRANSITION_SCHEMA.extend({
			toState: z.literal(EventSessionState.FINALIZED_NO_MERITS),
			data: z
				.object({
					reviewFinalizedAt: z.date(),
					reviewFinalizedByUserId: z.string().min(1)
				})
				.strict()
		}),
		BASE_TRANSITION_SCHEMA.extend({
			toState: z.literal(EventSessionState.DRAFT),
			data: z.undefined().optional()
		})
	])
	.superRefine((value, ctx) => {
		const fromStates = Array.isArray(value.fromState) ? value.fromState : [value.fromState];
		for (const fromState of fromStates) {
			if (!ALLOWED_TRANSITIONS[fromState].includes(value.toState)) {
				ctx.addIssue({
					code: 'custom',
					message: `Invalid event session transition: ${fromState} -> ${value.toState}`
				});
			}
		}
	});

type UpdateEventSessionStateParams = z.infer<typeof UPDATE_EVENT_SESSION_STATE_SCHEMA>;

export async function updateEventSessionState(params: UpdateEventSessionStateParams) {
	const parsed = UPDATE_EVENT_SESSION_STATE_SCHEMA.parse(params);
	const mutationData: Prisma.EventUncheckedUpdateManyInput = {
		state: parsed.toState,
		...(parsed.data ?? {})
	};

	const result = await prisma.event.updateMany({
		where: {
			id: parsed.eventSessionId,
			state: Array.isArray(parsed.fromState) ? { in: parsed.fromState } : parsed.fromState
		},
		data: mutationData
	});

	return result.count === 1;
}
