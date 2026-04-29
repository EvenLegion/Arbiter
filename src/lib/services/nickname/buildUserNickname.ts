import { type Division, DivisionKind } from '@prisma/client';
import { DISCORD_MAX_NICKNAME_LENGTH } from '../../constants';
import { getMeritRankSymbol, MAX_MERIT_RANK_LEVEL, resolveMeritRankLevel } from '../merit-rank/meritRank';

const PREFIX_PRIORITY: ((division: Division) => boolean)[] = [
	(division) => division.kind === DivisionKind.INITIATE,
	(division) => division.kind === DivisionKind.RESERVE,
	(division) => division.kind === DivisionKind.STAFF,
	(division) => division.kind === DivisionKind.SPECIAL && division.code !== 'CENT',
	(division) => division.kind === DivisionKind.LANCEARIUS,
	(division) => division.kind === DivisionKind.NAVY,
	(division) => division.kind === DivisionKind.MARINES,
	(division) => division.kind === DivisionKind.SUPPORT,
	(division) => division.kind === DivisionKind.LEGIONNAIRE
];

const DIVISION_CODE_PRIORITY = ['QRM', 'CMDN', 'CMDM', 'CMDS', 'CMD'];
const NICKNAME_TOO_LONG_ERROR_NAME = 'NicknameTooLongError';

type BuildUserNicknameParams = {
	isGuildOwner: boolean;
	baseNickname: string;
	divisions: Division[];
	totalMerits: number;
};

export const buildUserNickname = ({
	isGuildOwner,
	baseNickname,
	divisions,
	totalMerits
}: BuildUserNicknameParams): { newUserNickname: string | null; reason?: string } => {
	if (isGuildOwner) {
		return { newUserNickname: null, reason: 'User is the guild owner' };
	}

	const meritRankLevel = resolveMeritRankLevel(totalMerits);

	for (const hasPriority of PREFIX_PRIORITY) {
		const priorityDivision = selectPriorityDivision(divisions, hasPriority);
		if (priorityDivision) {
			return {
				newUserNickname: appendMeritRankSuffix({
					nickname: `${priorityDivision.displayNamePrefix} | ${baseNickname}`,
					meritRankLevel,
					shouldShowRank: priorityDivision.showRank
				})
			};
		}
	}

	return {
		newUserNickname: appendMeritRankSuffix({
			nickname: baseNickname,
			meritRankLevel,
			shouldShowRank: true
		})
	};
};

function selectPriorityDivision(divisions: Division[], hasPriority: (division: Division) => boolean) {
	const matchingDivisions = divisions.filter((division) => hasPriority(division) && division.displayNamePrefix);

	for (const divisionCode of DIVISION_CODE_PRIORITY) {
		const prioritizedDivision = matchingDivisions.find((division) => division.code === divisionCode);
		if (prioritizedDivision) {
			return prioritizedDivision;
		}
	}

	return matchingDivisions[0] ?? null;
}

function appendMeritRankSuffix({
	nickname,
	meritRankLevel,
	shouldShowRank
}: {
	nickname: string;
	meritRankLevel: number | null;
	shouldShowRank: boolean;
}) {
	const sanitizedNickname = stripTrailingMeritRankSuffix(nickname);
	if (!meritRankLevel || !shouldShowRank) {
		if (sanitizedNickname.length > DISCORD_MAX_NICKNAME_LENGTH) {
			throw createNicknameTooLongError({
				computedNickname: sanitizedNickname,
				computedLength: sanitizedNickname.length
			});
		}

		return sanitizedNickname;
	}

	const meritRankSymbol = getMeritRankSymbol(meritRankLevel);
	if (!meritRankSymbol) {
		return sanitizedNickname;
	}

	const suffix = ` ${meritRankSymbol}`;
	if (sanitizedNickname.length + suffix.length <= DISCORD_MAX_NICKNAME_LENGTH) {
		return `${sanitizedNickname}${suffix}`;
	}

	throw createNicknameTooLongError({
		computedNickname: `${sanitizedNickname}${suffix}`,
		computedLength: sanitizedNickname.length + suffix.length
	});
}

function createNicknameTooLongError({ computedNickname, computedLength }: { computedNickname: string; computedLength: number }) {
	const error = new Error(
		`Computed nickname exceeds Discord limit (${DISCORD_MAX_NICKNAME_LENGTH}): length=${computedLength} nickname="${computedNickname}"`
	) as Error & {
		computedNickname: string;
		computedLength: number;
		maxLength: number;
	};
	error.name = NICKNAME_TOO_LONG_ERROR_NAME;
	error.computedNickname = computedNickname;
	error.computedLength = computedLength;
	error.maxLength = DISCORD_MAX_NICKNAME_LENGTH;
	return error;
}

export function isNicknameTooLongError(error: unknown) {
	return error instanceof Error && error.name === NICKNAME_TOO_LONG_ERROR_NAME;
}

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
