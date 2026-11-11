import { describe, expect, it } from 'vitest';

import { LEGACY_MERIT_RANK_SYMBOLS, MAX_MERIT_RANK_LEVEL, MERIT_RANK_THRESHOLDS, getMeritRankSymbol, resolveMeritRankLevel } from '../src';

// Frozen legacy policy: API v1 and nickname suffix cleanup depend on these exact values.
const LEGACY_CUMULATIVE_MERITS = [
	1, 3, 7, 12, 18, 25, 33, 42, 52, 63, 75, 88, 102, 117, 133, 150, 168, 187, 207, 228, 250, 273, 297, 322, 348, 375, 403, 432, 462, 493, 525, 558,
	592, 627, 663, 700, 738, 777, 817, 858, 900, 943, 987, 1032, 1078, 1125, 1173, 1222, 1272, 1323
];

const LEGACY_SYMBOL_CODE_POINTS = [
	...Array.from({ length: 20 }, (_, index) => 0x2460 + index), // ① to ⑳
	...Array.from({ length: 15 }, (_, index) => 0x3251 + index), // ㉑ to ㉟
	...Array.from({ length: 15 }, (_, index) => 0x32b1 + index) // ㊱ to ㊿
];

describe('workspace merit-rank domain', () => {
	it('preserves the canonical threshold and symbol policy', () => {
		expect(resolveMeritRankLevel(0)).toBeNull();
		expect(resolveMeritRankLevel(1)).toBe(1);
		expect(resolveMeritRankLevel(1323)).toBe(MAX_MERIT_RANK_LEVEL);
		expect(getMeritRankSymbol(1)).toBeTypeOf('string');
	});

	it('keeps the full frozen 50-level legacy table', () => {
		expect(MERIT_RANK_THRESHOLDS).toEqual(LEGACY_CUMULATIVE_MERITS.map((cumulativeMerits, index) => ({ level: index + 1, cumulativeMerits })));
		expect(MAX_MERIT_RANK_LEVEL).toBe(50);
		expect(Object.isFrozen(MERIT_RANK_THRESHOLDS)).toBe(true);
		expect(MERIT_RANK_THRESHOLDS.every((threshold) => Object.isFrozen(threshold))).toBe(true);
	});

	it('keeps exactly the 50 legacy symbol code points', () => {
		expect(LEGACY_MERIT_RANK_SYMBOLS.map((symbol) => symbol.codePointAt(0))).toEqual(LEGACY_SYMBOL_CODE_POINTS);
		expect(LEGACY_MERIT_RANK_SYMBOLS).toHaveLength(50);
		expect(Object.isFrozen(LEGACY_MERIT_RANK_SYMBOLS)).toBe(true);
	});
});
