import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { seedMeritTypes } from '../../../prisma/seeders/meritTypes';

// Merit totals are computed from these amounts at read time. Changing one rewrites every member's total
// on the next seed, so the merit badge work must never edit them.
const EXPECTED_MERIT_AMOUNTS = {
	TIER_0: 0,
	TIER_1: 1,
	TIER_2: 1,
	TIER_3: 3,
	TRAINING: 2,
	COMMANDER_MERIT: 1,
	CENTURION_HOST_MERIT: 2,
	TESSERARIUS_MERIT: 4,
	DEMERIT: -1
};

describe('seedMeritTypes', () => {
	it('seeds the pinned merit amount for every merit type in both the create and update branches', async () => {
		const upsert = vi.fn().mockResolvedValue(undefined);

		await seedMeritTypes({ meritType: { upsert } } as unknown as PrismaClient);

		const calls = upsert.mock.calls.map(
			([args]) => args as { where: { code: string }; create: { code: string; meritAmount: number }; update: { meritAmount: number } }
		);
		expect(Object.fromEntries(calls.map((call) => [call.where.code, call.create.meritAmount]))).toEqual(EXPECTED_MERIT_AMOUNTS);
		expect(Object.fromEntries(calls.map((call) => [call.where.code, call.update.meritAmount]))).toEqual(EXPECTED_MERIT_AMOUNTS);
		expect(calls.every((call) => call.create.code === call.where.code)).toBe(true);
	});
});
