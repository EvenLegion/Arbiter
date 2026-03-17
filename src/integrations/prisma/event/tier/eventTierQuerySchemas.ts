import { z } from 'zod';

const FIND_MANY_EVENT_TIERS_SCHEMA = z.object({
	eventTierIds: z.array(z.number().int().positive()).optional(),
	eventTierId: z.number().int().positive().optional(),
	query: z.string().default(''),
	limit: z.number().int().positive().optional()
});

const FIND_FIRST_EVENT_TIER_SCHEMA = z.object({
	where: z.record(z.string(), z.unknown())
});

export function parseFindManyEventTiersInput(input: { eventTierIds?: number[]; eventTierId?: number; query?: string; limit?: number }) {
	return FIND_MANY_EVENT_TIERS_SCHEMA.parse(input);
}

export function parseFindFirstEventTierInput(input: { where: Record<string, unknown> }) {
	return FIND_FIRST_EVENT_TIER_SCHEMA.parse(input);
}
