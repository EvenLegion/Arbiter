import { describe, expect, it } from 'vitest';

import { MAX_MERIT_RANK_LEVEL, getMeritRankSymbol, resolveMeritRankLevel } from '../src';

describe('workspace merit-rank domain', () => {
	it('preserves the canonical threshold and symbol policy', () => {
		expect(resolveMeritRankLevel(0)).toBeNull();
		expect(resolveMeritRankLevel(1)).toBe(1);
		expect(resolveMeritRankLevel(1323)).toBe(MAX_MERIT_RANK_LEVEL);
		expect(getMeritRankSymbol(1)).toBeTypeOf('string');
	});
});
