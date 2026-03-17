import { MERIT_RANK_SYMBOL_RANGES, MERIT_RANK_THRESHOLDS } from './meritRankPolicy';

export { MERIT_RANK_THRESHOLDS, MAX_MERIT_RANK_LEVEL } from './meritRankPolicy';

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
	const matchingRange = MERIT_RANK_SYMBOL_RANGES.find((range) => level >= range.minLevel && level <= range.maxLevel);
	if (matchingRange) {
		return String.fromCodePoint(matchingRange.codePointOffset + level);
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
