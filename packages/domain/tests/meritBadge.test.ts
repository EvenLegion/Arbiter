import { describe, expect, it } from 'vitest';

import {
	MAX_MERIT_BADGE_TIER,
	MERIT_BADGE_LEVELS,
	MERIT_BADGE_TIERS,
	getMeritBadgeTier,
	resolveMeritBadgePromotion,
	resolveMeritBadgeProgress,
	resolveMeritBadgeTier
} from '../src';

const EXPECTED_FLOORS = [
	1, 2, 3, 5, 8, 11, 16, 21, 27, 35, 43, 53, 64, 80, 96, 120, 144, 171, 200, 232, 267, 307, 347, 387, 427, 480, 533, 613, 693, 800, 933, 1093, 1280,
	1493, 1733, 2000
];

const EXPECTED_LEVEL_NAMES = [
	'Ferrum',
	'Aes',
	'Argentum',
	'Aurum',
	'Smaragdus',
	'Sapphirus',
	'Amethystus',
	'Adamas',
	'Obsianus',
	'Sanguis',
	'Aquila',
	'Supra Omnia'
];

describe('merit badge ladder', () => {
	it('pins the literal floors', () => {
		expect(MERIT_BADGE_TIERS.map((tier) => tier.floor)).toEqual(EXPECTED_FLOORS);
		expect(MAX_MERIT_BADGE_TIER).toBe(36);
	});

	it('pins the level names and labels', () => {
		expect(MERIT_BADGE_LEVELS.map((level) => level.name)).toEqual(EXPECTED_LEVEL_NAMES);
		expect(getMeritBadgeTier(1)?.label).toBe('Ferrum I');
		expect(getMeritBadgeTier(22)?.label).toBe('Adamas I');
		expect(getMeritBadgeTier(36)?.label).toBe('Supra Omnia III');
	});

	it('numbers tiers 1..36 with three Roman-numeral sections per level and strictly rising floors', () => {
		MERIT_BADGE_TIERS.forEach((tier, index) => {
			expect(tier.tier).toBe(index + 1);
			expect(tier.level).toBe(Math.floor(index / 3) + 1);
			expect(tier.levelName).toBe(EXPECTED_LEVEL_NAMES[tier.level - 1]);
			expect(tier.section).toBe(['I', 'II', 'III'][index % 3]);
			expect(tier.label).toBe(`${tier.levelName} ${tier.section}`);
			if (index > 0) {
				expect(tier.floor).toBeGreaterThan(MERIT_BADGE_TIERS[index - 1].floor);
			}
		});
	});

	it('is deeply frozen', () => {
		expect(Object.isFrozen(MERIT_BADGE_TIERS)).toBe(true);
		expect(Object.isFrozen(MERIT_BADGE_TIERS[0])).toBe(true);
		expect(Object.isFrozen(MERIT_BADGE_LEVELS)).toBe(true);
		expect(Object.isFrozen(MERIT_BADGE_LEVELS[0])).toBe(true);
		expect(Object.isFrozen(MERIT_BADGE_LEVELS[0].floors)).toBe(true);
	});
});

describe('resolveMeritBadgeTier', () => {
	it.each(MERIT_BADGE_TIERS.map((tier) => [tier.floor, tier.tier] as const))('total %i at a floor resolves to tier %i', (floor, tier) => {
		expect(resolveMeritBadgeTier(floor)?.tier).toBe(tier);
	});

	it.each(MERIT_BADGE_TIERS.map((tier) => [tier.floor - 1, tier.tier - 1] as const))(
		'total %i one below a floor resolves to tier %i',
		(total, tier) => {
			expect(resolveMeritBadgeTier(total)?.tier ?? 0).toBe(tier);
		}
	);

	it.each([
		[12, 'Aes III'],
		[599, 'Obsianus III'],
		[1323, 'Aquila III'],
		[2000, 'Supra Omnia III'],
		[1e6, 'Supra Omnia III']
	])('total %s resolves to %s', (total, label) => {
		expect(resolveMeritBadgeTier(total)?.label).toBe(label);
	});

	it.each([Number.NaN, undefined as unknown as number, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -3, 0, 0.5])(
		'total %s has no badge',
		(total) => {
			expect(resolveMeritBadgeTier(total)).toBeNull();
		}
	);

	it('never moves down as the total rises from -10 to 2500', () => {
		let previousTier = 0;
		for (let total = -10; total <= 2500; total++) {
			const tier = resolveMeritBadgeTier(total)?.tier ?? 0;
			expect(tier).toBeGreaterThanOrEqual(previousTier);
			expect(tier - previousTier).toBeLessThanOrEqual(1);
			previousTier = tier;
		}
		expect(previousTier).toBe(MAX_MERIT_BADGE_TIER);
	});
});

describe('getMeritBadgeTier', () => {
	it.each([0, 37, -1, 1.5, Number.NaN])('returns null for tier %s', (tier) => {
		expect(getMeritBadgeTier(tier)).toBeNull();
	});

	it('returns the first and last tiers', () => {
		expect(getMeritBadgeTier(1)).toBe(MERIT_BADGE_TIERS[0]);
		expect(getMeritBadgeTier(36)).toBe(MERIT_BADGE_TIERS[35]);
	});
});

describe('resolveMeritBadgeProgress', () => {
	it('reports the next badge and the merits still needed', () => {
		expect(resolveMeritBadgeProgress(12)).toEqual({
			currentTier: expect.objectContaining({ label: 'Aes III', floor: 11 }),
			nextTier: expect.objectContaining({ label: 'Argentum I', floor: 16 }),
			meritsIntoCurrentTier: 1,
			meritsNeededForNextTier: 5,
			meritsRemainingToNextTier: 4,
			progressRatio: 0.2,
			progressPercent: 20
		});
	});

	it('points a member with no badge at Ferrum I', () => {
		expect(resolveMeritBadgeProgress(0)).toMatchObject({
			currentTier: null,
			nextTier: { label: 'Ferrum I' },
			meritsRemainingToNextTier: 1,
			progressPercent: 0
		});
		expect(resolveMeritBadgeProgress(-4)).toMatchObject({ currentTier: null, meritsIntoCurrentTier: 0, meritsRemainingToNextTier: 5 });
		expect(resolveMeritBadgeProgress(Number.NaN)).toMatchObject({ currentTier: null, meritsRemainingToNextTier: 1 });
	});

	it('reports full progress at the top badge', () => {
		expect(resolveMeritBadgeProgress(2400)).toMatchObject({
			currentTier: { label: 'Supra Omnia III' },
			nextTier: null,
			meritsIntoCurrentTier: 400,
			meritsNeededForNextTier: null,
			meritsRemainingToNextTier: null,
			progressPercent: 100
		});
	});
});

describe('resolveMeritBadgePromotion', () => {
	it('reports a section promotion without a level up', () => {
		expect(resolveMeritBadgePromotion({ previousTotalMerits: 5, currentTotalMerits: 8 })).toEqual({
			previousTier: expect.objectContaining({ label: 'Aes I' }),
			currentTier: expect.objectContaining({ label: 'Aes II' }),
			isLevelUp: false
		});
	});

	it('reports a level up when the promotion reaches a new level', () => {
		expect(resolveMeritBadgePromotion({ previousTotalMerits: 10, currentTotalMerits: 16 })).toMatchObject({
			previousTier: { label: 'Aes II' },
			currentTier: { label: 'Argentum I' },
			isLevelUp: true
		});
		expect(resolveMeritBadgePromotion({ previousTotalMerits: 0, currentTotalMerits: 1 })).toMatchObject({
			previousTier: null,
			currentTier: { label: 'Ferrum I' },
			isLevelUp: true
		});
	});

	it('returns null when the tier stays the same or drops', () => {
		expect(resolveMeritBadgePromotion({ previousTotalMerits: 5, currentTotalMerits: 7 })).toBeNull();
		expect(resolveMeritBadgePromotion({ previousTotalMerits: 8, currentTotalMerits: 7 })).toBeNull();
		expect(resolveMeritBadgePromotion({ previousTotalMerits: 1, currentTotalMerits: 0 })).toBeNull();
		expect(resolveMeritBadgePromotion({ previousTotalMerits: 2000, currentTotalMerits: 2500 })).toBeNull();
	});
});
