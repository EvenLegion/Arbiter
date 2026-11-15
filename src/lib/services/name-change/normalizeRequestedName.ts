import { LEGACY_MERIT_RANK_SYMBOLS } from '../merit-rank/meritRank';

type NormalizeRequestedNameParams = {
	rawRequestedName: string;
	divisionPrefixes: string[];
};

type NormalizeRequestedNameResult =
	| {
			success: true;
			normalizedRequestedName: string;
			strippedDivisionPrefix: string | null;
	  }
	| {
			success: false;
			errorMessage: string;
	  };

export function normalizeRequestedName({ rawRequestedName, divisionPrefixes }: NormalizeRequestedNameParams): NormalizeRequestedNameResult {
	const trimmed = rawRequestedName.trim();
	if (!trimmed) {
		return {
			success: false,
			errorMessage: 'Requested name is required.'
		};
	}

	let candidate = trimmed;
	let strippedDivisionPrefix: string | null = null;

	if (candidate.includes('|')) {
		const separatorIndex = candidate.indexOf('|');
		const rawPrefix = candidate.slice(0, separatorIndex).trim();
		const rawAfterSeparator = candidate.slice(separatorIndex + 1).trim();

		const knownPrefixes = divisionPrefixes.map((prefix) => prefix.trim().toLowerCase()).filter((prefix) => prefix.length > 0);
		const hasKnownPrefix = knownPrefixes.includes(rawPrefix.toLowerCase());

		if (!hasKnownPrefix || rawAfterSeparator.length === 0) {
			return {
				success: false,
				errorMessage:
					'Requested name is invalid. Do not include division prefixes. Use only your base nickname (no "|", spaces, or merit rank symbols).'
			};
		}

		candidate = rawAfterSeparator;
		strippedDivisionPrefix = rawPrefix;
	}

	if (candidate.includes('|')) {
		return {
			success: false,
			errorMessage: 'Requested name cannot contain `|`.'
		};
	}

	if (/\s/.test(candidate)) {
		return {
			success: false,
			errorMessage: 'Requested name cannot contain spaces.'
		};
	}

	if (containsMeritRankSymbol(candidate)) {
		return {
			success: false,
			errorMessage: 'Requested name cannot contain merit rank symbols.'
		};
	}

	return {
		success: true,
		normalizedRequestedName: candidate,
		strippedDivisionPrefix
	};
}

function containsMeritRankSymbol(value: string) {
	for (const symbol of LEGACY_MERIT_RANK_SYMBOLS) {
		if (value.includes(symbol)) {
			return true;
		}
	}

	return false;
}
