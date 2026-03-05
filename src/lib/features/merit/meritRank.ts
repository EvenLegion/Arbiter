export const MERIT_RANK_THRESHOLDS: ReadonlyArray<{ level: number; cumulativeMerits: number }> = [
	{ level: 1, cumulativeMerits: 1 },
	{ level: 2, cumulativeMerits: 3 },
	{ level: 3, cumulativeMerits: 7 },
	{ level: 4, cumulativeMerits: 12 },
	{ level: 5, cumulativeMerits: 18 },
	{ level: 6, cumulativeMerits: 25 },
	{ level: 7, cumulativeMerits: 33 },
	{ level: 8, cumulativeMerits: 42 },
	{ level: 9, cumulativeMerits: 52 },
	{ level: 10, cumulativeMerits: 63 },
	{ level: 11, cumulativeMerits: 75 },
	{ level: 12, cumulativeMerits: 88 },
	{ level: 13, cumulativeMerits: 102 },
	{ level: 14, cumulativeMerits: 117 },
	{ level: 15, cumulativeMerits: 133 },
	{ level: 16, cumulativeMerits: 150 },
	{ level: 17, cumulativeMerits: 168 },
	{ level: 18, cumulativeMerits: 187 },
	{ level: 19, cumulativeMerits: 207 },
	{ level: 20, cumulativeMerits: 228 },
	{ level: 21, cumulativeMerits: 250 },
	{ level: 22, cumulativeMerits: 273 },
	{ level: 23, cumulativeMerits: 297 },
	{ level: 24, cumulativeMerits: 322 },
	{ level: 25, cumulativeMerits: 348 },
	{ level: 26, cumulativeMerits: 375 },
	{ level: 27, cumulativeMerits: 403 },
	{ level: 28, cumulativeMerits: 432 },
	{ level: 29, cumulativeMerits: 462 },
	{ level: 30, cumulativeMerits: 493 },
	{ level: 31, cumulativeMerits: 525 },
	{ level: 32, cumulativeMerits: 558 },
	{ level: 33, cumulativeMerits: 592 },
	{ level: 34, cumulativeMerits: 627 },
	{ level: 35, cumulativeMerits: 663 },
	{ level: 36, cumulativeMerits: 700 },
	{ level: 37, cumulativeMerits: 738 },
	{ level: 38, cumulativeMerits: 777 },
	{ level: 39, cumulativeMerits: 817 },
	{ level: 40, cumulativeMerits: 858 },
	{ level: 41, cumulativeMerits: 900 },
	{ level: 42, cumulativeMerits: 943 },
	{ level: 43, cumulativeMerits: 987 },
	{ level: 44, cumulativeMerits: 1032 },
	{ level: 45, cumulativeMerits: 1078 },
	{ level: 46, cumulativeMerits: 1125 },
	{ level: 47, cumulativeMerits: 1173 },
	{ level: 48, cumulativeMerits: 1222 },
	{ level: 49, cumulativeMerits: 1272 },
	{ level: 50, cumulativeMerits: 1323 }
];
export const MAX_MERIT_RANK_LEVEL = MERIT_RANK_THRESHOLDS[MERIT_RANK_THRESHOLDS.length - 1]?.level ?? 0;

const LEVEL_TO_CUMULATIVE_MERITS = new Map<number, number>(MERIT_RANK_THRESHOLDS.map((threshold) => [threshold.level, threshold.cumulativeMerits]));
const LEVELS_BY_THRESHOLD_INDEX = MERIT_RANK_THRESHOLDS.map((threshold) => threshold.level);
const SORTED_CUMULATIVE_MERITS = MERIT_RANK_THRESHOLDS.map((threshold) => threshold.cumulativeMerits);

type MeritRankProgress = {
	currentLevel: number | null;
	currentThreshold: number;
	nextLevel: number | null;
	nextThreshold: number | null;
	meritsIntoCurrentLevel: number;
	meritsNeededForNextLevel: number | null;
	meritsRemainingToNextLevel: number | null;
	progressRatio: number;
	progressPercent: number;
};

export function resolveMeritRankLevel(totalMerits: number): number | null {
	const closestThresholdIndex = findClosestThresholdIndexAtOrBelow(totalMerits);
	if (closestThresholdIndex === null) {
		return null;
	}

	return LEVELS_BY_THRESHOLD_INDEX[closestThresholdIndex] ?? null;
}

export function getMeritRankSymbol(level: number): string | null {
	if (level >= 1 && level <= 20) {
		return String.fromCodePoint(9311 + level);
	}

	if (level >= 21 && level <= 35) {
		return String.fromCodePoint(12860 + level);
	}

	if (level >= 36 && level <= 50) {
		return String.fromCodePoint(12941 + level);
	}

	return null;
}

export function resolveMeritRankProgress(totalMerits: number): MeritRankProgress {
	const currentLevel = resolveMeritRankLevel(totalMerits);
	const currentThreshold = currentLevel ? (getThresholdForLevel(currentLevel) ?? 0) : 0;
	const nextLevel = currentLevel ? currentLevel + 1 : 1;
	const nextThreshold = getThresholdForLevel(nextLevel) ?? null;

	if (!nextThreshold) {
		return {
			currentLevel,
			currentThreshold,
			nextLevel: null,
			nextThreshold: null,
			meritsIntoCurrentLevel: Math.max(0, totalMerits - currentThreshold),
			meritsNeededForNextLevel: null,
			meritsRemainingToNextLevel: null,
			progressRatio: 1,
			progressPercent: 100
		};
	}

	const meritsNeededForNextLevel = Math.max(1, nextThreshold - currentThreshold);
	const meritsIntoCurrentLevel = Math.max(0, totalMerits - currentThreshold);
	const meritsRemainingToNextLevel = Math.max(0, nextThreshold - totalMerits);
	const progressRatio = Math.min(1, meritsIntoCurrentLevel / meritsNeededForNextLevel);
	const progressPercent = Math.round(progressRatio * 100);

	return {
		currentLevel,
		currentThreshold,
		nextLevel,
		nextThreshold,
		meritsIntoCurrentLevel,
		meritsNeededForNextLevel,
		meritsRemainingToNextLevel,
		progressRatio,
		progressPercent
	};
}

export function buildMeritRankProgressBar({ progressRatio, width = 12 }: { progressRatio: number; width?: number }): string {
	const clamped = Math.max(0, Math.min(1, progressRatio));
	const safeWidth = Math.max(4, width);
	const filled = Math.round(clamped * safeWidth);
	const empty = Math.max(0, safeWidth - filled);
	return `[${'='.repeat(filled)}${'-'.repeat(empty)}]`;
}

function getThresholdForLevel(level: number): number | undefined {
	return LEVEL_TO_CUMULATIVE_MERITS.get(level);
}

function findClosestThresholdIndexAtOrBelow(totalMerits: number): number | null {
	if (SORTED_CUMULATIVE_MERITS.length === 0 || totalMerits < SORTED_CUMULATIVE_MERITS[0]) {
		return null;
	}

	let low = 0;
	let high = SORTED_CUMULATIVE_MERITS.length - 1;
	let bestIndex: number | null = null;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const value = SORTED_CUMULATIVE_MERITS[mid];
		if (value <= totalMerits) {
			bestIndex = mid;
			low = mid + 1;
			continue;
		}

		high = mid - 1;
	}

	return bestIndex;
}
