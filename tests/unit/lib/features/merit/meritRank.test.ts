import { describe, expect, it } from 'vitest';

import {
	MAX_MERIT_RANK_LEVEL,
	buildMeritRankProgressBar,
	getMeritRankSymbol,
	resolveMeritRankLevel,
	resolveMeritRankProgress
} from '../../../../../src/lib/features/merit/meritRank';

describe('resolveMeritRankLevel', () => {
	it('returns null below the first threshold', () => {
		expect(resolveMeritRankLevel(0)).toBeNull();
	});

	it('returns exact threshold levels', () => {
		expect(resolveMeritRankLevel(1)).toBe(1);
		expect(resolveMeritRankLevel(3)).toBe(2);
		expect(resolveMeritRankLevel(7)).toBe(3);
	});

	it('returns the nearest level below a mid-range total', () => {
		expect(resolveMeritRankLevel(10)).toBe(3);
		expect(resolveMeritRankLevel(1323)).toBe(MAX_MERIT_RANK_LEVEL);
	});
});

describe('getMeritRankSymbol', () => {
	it('returns symbols for representative valid ranges', () => {
		expect(getMeritRankSymbol(1)).toBeTypeOf('string');
		expect(getMeritRankSymbol(25)).toBeTypeOf('string');
		expect(getMeritRankSymbol(40)).toBeTypeOf('string');
	});

	it('returns null for out-of-range levels', () => {
		expect(getMeritRankSymbol(0)).toBeNull();
		expect(getMeritRankSymbol(MAX_MERIT_RANK_LEVEL + 1)).toBeNull();
	});
});

describe('resolveMeritRankProgress', () => {
	it('handles totals before the first rank', () => {
		expect(resolveMeritRankProgress(0)).toMatchObject({
			currentLevel: null,
			currentThreshold: 0,
			nextLevel: 1,
			nextThreshold: 1,
			meritsRemainingToNextLevel: 1,
			progressRatio: 0,
			progressPercent: 0
		});
	});

	it('handles totals between ranks', () => {
		expect(resolveMeritRankProgress(2)).toMatchObject({
			currentLevel: 1,
			currentThreshold: 1,
			nextLevel: 2,
			nextThreshold: 3,
			meritsIntoCurrentLevel: 1,
			meritsRemainingToNextLevel: 1,
			progressRatio: 0.5,
			progressPercent: 50
		});
	});

	it('handles totals at max rank', () => {
		expect(resolveMeritRankProgress(1323)).toMatchObject({
			currentLevel: MAX_MERIT_RANK_LEVEL,
			nextLevel: null,
			nextThreshold: null,
			progressRatio: 1,
			progressPercent: 100
		});
	});
});

describe('buildMeritRankProgressBar', () => {
	it('clamps progress below zero and enforces a minimum width', () => {
		expect(buildMeritRankProgressBar({ progressRatio: -1, width: 1 })).toBe('[----]');
	});

	it('clamps progress above one', () => {
		expect(buildMeritRankProgressBar({ progressRatio: 2, width: 4 })).toBe('[====]');
	});

	it('renders intermediate progress', () => {
		expect(buildMeritRankProgressBar({ progressRatio: 0.5, width: 6 })).toBe('[===---]');
	});
});
