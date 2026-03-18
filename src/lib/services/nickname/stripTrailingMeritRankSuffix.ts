import { getMeritRankSymbol, MAX_MERIT_RANK_LEVEL } from '../merit-rank/meritRank';

export function stripTrailingMeritRankSuffix(value: string) {
	const trimmed = value.trimEnd();

	for (let level = 1; level <= MAX_MERIT_RANK_LEVEL; level++) {
		const meritRankSymbol = getMeritRankSymbol(level);
		if (!meritRankSymbol) {
			continue;
		}

		const suffix = ` ${meritRankSymbol}`;
		if (trimmed.endsWith(suffix)) {
			return trimmed.slice(0, -suffix.length).trimEnd();
		}
	}

	return trimmed;
}
