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

export const MERIT_RANK_SYMBOL_RANGES: ReadonlyArray<{
	minLevel: number;
	maxLevel: number;
	codePointOffset: number;
}> = [
	{
		minLevel: 1,
		maxLevel: 20,
		codePointOffset: 9311
	},
	{
		minLevel: 21,
		maxLevel: 35,
		codePointOffset: 12860
	},
	{
		minLevel: 36,
		maxLevel: 50,
		codePointOffset: 12941
	}
];
