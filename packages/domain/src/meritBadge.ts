/**
 * Merit badge policy: the 36-tier, 2,000-deep badge ladder.
 *
 * A badge is the highest tier floor at or below a member's current merit total.
 * Totals are never stored or edited for badges; they are read at query time.
 *
 * Floor derivation (D9): each floor is round(base × 2000 / 3750), where base is the
 * earlier 3,750-deep ladder (1, 3, 6 … 2800, 3250, 3750). The first floor is fixed
 * at 1 and every floor is at least one above the previous floor. The literal list
 * below is authoritative. Floors can change later only by a reviewed code change,
 * which moves members between badges and never changes merits.
 *
 * This table is separate from the frozen legacy 50-level policy in `meritRank.ts`.
 */

export type MeritBadgeSection = 'I' | 'II' | 'III';

export type MeritBadgeLevel = Readonly<{
	level: number;
	name: string;
	floors: readonly [number, number, number];
}>;

export type MeritBadgeTier = Readonly<{
	/** 1-based position on the ladder, 1 (Ferrum I) to 36 (Supra Omnia III). */
	tier: number;
	/** 1-based badge level, 1 (Ferrum) to 12 (Supra Omnia). */
	level: number;
	levelName: string;
	section: MeritBadgeSection;
	/** Lowest merit total that holds this tier. */
	floor: number;
	/** Display label, for example "Adamas I". */
	label: string;
}>;

const MERIT_BADGE_SECTIONS: readonly MeritBadgeSection[] = Object.freeze(['I', 'II', 'III'] as const);

export const MERIT_BADGE_LEVELS: readonly MeritBadgeLevel[] = deepFreeze([
	{ level: 1, name: 'Ferrum', floors: [1, 2, 3] },
	{ level: 2, name: 'Aes', floors: [5, 8, 11] },
	{ level: 3, name: 'Argentum', floors: [16, 21, 27] },
	{ level: 4, name: 'Aurum', floors: [35, 43, 53] },
	{ level: 5, name: 'Smaragdus', floors: [64, 80, 96] },
	{ level: 6, name: 'Sapphirus', floors: [120, 144, 171] },
	{ level: 7, name: 'Amethystus', floors: [200, 232, 267] },
	{ level: 8, name: 'Adamas', floors: [307, 347, 387] },
	{ level: 9, name: 'Obsianus', floors: [427, 480, 533] },
	{ level: 10, name: 'Sanguis', floors: [613, 693, 800] },
	{ level: 11, name: 'Aquila', floors: [933, 1093, 1280] },
	{ level: 12, name: 'Supra Omnia', floors: [1493, 1733, 2000] }
] satisfies MeritBadgeLevel[]);

export const MERIT_BADGE_TIERS: readonly MeritBadgeTier[] = deepFreeze(
	MERIT_BADGE_LEVELS.flatMap((badgeLevel, levelIndex) =>
		badgeLevel.floors.map((floor, sectionIndex) => {
			const section = MERIT_BADGE_SECTIONS[sectionIndex];
			return {
				tier: levelIndex * MERIT_BADGE_SECTIONS.length + sectionIndex + 1,
				level: badgeLevel.level,
				levelName: badgeLevel.name,
				section,
				floor,
				label: `${badgeLevel.name} ${section}`
			};
		})
	)
);

export const MAX_MERIT_BADGE_TIER = MERIT_BADGE_TIERS.length;

const SORTED_FLOORS = MERIT_BADGE_TIERS.map((tier) => tier.floor);

export type MeritBadgeProgress = {
	currentTier: MeritBadgeTier | null;
	nextTier: MeritBadgeTier | null;
	meritsIntoCurrentTier: number;
	meritsNeededForNextTier: number | null;
	meritsRemainingToNextTier: number | null;
	progressRatio: number;
	progressPercent: number;
};

export type MeritBadgePromotion = {
	previousTier: MeritBadgeTier | null;
	currentTier: MeritBadgeTier;
	/** True when the promotion also reaches a new badge level, for example Ferrum III to Aes I. */
	isLevelUp: boolean;
};

/** Returns the badge tier for a merit total, or null for non-finite totals and totals below 1. */
export function resolveMeritBadgeTier(totalMerits: number): MeritBadgeTier | null {
	if (!Number.isFinite(totalMerits) || totalMerits < SORTED_FLOORS[0]) {
		return null;
	}

	let low = 0;
	let high = SORTED_FLOORS.length - 1;
	let bestIndex = 0;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		if (SORTED_FLOORS[mid] <= totalMerits) {
			bestIndex = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return MERIT_BADGE_TIERS[bestIndex] ?? null;
}

/** Returns the tier with this 1-based tier number, or null when it is outside 1..MAX_MERIT_BADGE_TIER. */
export function getMeritBadgeTier(tier: number): MeritBadgeTier | null {
	if (!Number.isInteger(tier) || tier < 1 || tier > MAX_MERIT_BADGE_TIER) {
		return null;
	}

	return MERIT_BADGE_TIERS[tier - 1] ?? null;
}

export function resolveMeritBadgeProgress(totalMerits: number): MeritBadgeProgress {
	const safeTotal = Number.isFinite(totalMerits) ? totalMerits : 0;
	const currentTier = resolveMeritBadgeTier(safeTotal);
	const currentFloor = currentTier?.floor ?? 0;
	const nextTier = getMeritBadgeTier((currentTier?.tier ?? 0) + 1);
	const meritsIntoCurrentTier = Math.max(0, safeTotal - currentFloor);

	if (!nextTier) {
		return {
			currentTier,
			nextTier: null,
			meritsIntoCurrentTier,
			meritsNeededForNextTier: null,
			meritsRemainingToNextTier: null,
			progressRatio: 1,
			progressPercent: 100
		};
	}

	const meritsNeededForNextTier = Math.max(1, nextTier.floor - currentFloor);
	const progressRatio = Math.min(1, meritsIntoCurrentTier / meritsNeededForNextTier);

	return {
		currentTier,
		nextTier,
		meritsIntoCurrentTier,
		meritsNeededForNextTier,
		meritsRemainingToNextTier: Math.max(0, nextTier.floor - safeTotal),
		progressRatio,
		progressPercent: Math.round(progressRatio * 100)
	};
}

/**
 * Returns the promotion when the current total holds a higher tier than the previous total,
 * otherwise null. A drop or an unchanged tier is not a promotion.
 */
export function resolveMeritBadgePromotion({
	previousTotalMerits,
	currentTotalMerits
}: {
	previousTotalMerits: number;
	currentTotalMerits: number;
}): MeritBadgePromotion | null {
	const previousTier = resolveMeritBadgeTier(previousTotalMerits);
	const currentTier = resolveMeritBadgeTier(currentTotalMerits);

	if (!currentTier || (previousTier && currentTier.tier <= previousTier.tier)) {
		return null;
	}

	return {
		previousTier,
		currentTier,
		isLevelUp: !previousTier || currentTier.level > previousTier.level
	};
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const nested of Object.values(value as Record<string, unknown>)) {
			deepFreeze(nested);
		}
	}

	return value;
}
