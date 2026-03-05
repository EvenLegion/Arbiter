import { type Division, DivisionKind } from '@prisma/client';
import { container } from '@sapphire/framework';
import { GuildMember } from 'discord.js';

import { findManyUsersDivisions, getUserTotalMerits } from '../../../integrations/prisma';
import type { ExecutionContext } from '../../logging/executionContext';
import { getMeritRankSymbol, MAX_MERIT_RANK_LEVEL, resolveMeritRankLevel } from '../merit/meritRank';

const PREFIX_PRIORITY: ((division: Division) => boolean)[] = [
	(division) => division.kind === DivisionKind.AUXILIARY,
	(division) => division.kind === DivisionKind.STAFF,
	(division) => division.kind === DivisionKind.SPECIAL && division.code !== 'CENT',
	(division) => division.kind === DivisionKind.LANCEARIUS,
	(division) => division.kind === DivisionKind.COMBAT,
	(division) => division.kind === DivisionKind.INDUSTRIAL,
	(division) => division.kind === DivisionKind.LEGIONNAIRE
];

const MAX_DISCORD_NICKNAME_LENGTH = 32;

type BuildUserNicknameParams = {
	discordUser: GuildMember;
	context: ExecutionContext;
	totalMeritsOverride?: number;
};

export const buildUserNickname = async ({
	discordUser,
	context: _context,
	totalMeritsOverride
}: BuildUserNicknameParams): Promise<{ newUserNickname: string | null; reason?: string }> => {
	const caller = 'buildUserNickname';
	const logger = _context.logger.child({ caller });

	if (discordUser.guild.ownerId === discordUser.id) {
		logger.trace('User is the guild owner, skipping nickname build');
		return { newUserNickname: null, reason: 'User is the guild owner' };
	}

	const usersDivisions = await findManyUsersDivisions({
		discordUserId: discordUser.id
	});

	const dbUser = await container.utilities.userDirectory.getOrThrow({ discordUserId: discordUser.id });
	const totalMerits =
		typeof totalMeritsOverride === 'number'
			? totalMeritsOverride
			: await getUserTotalMerits({
					userDbUserId: dbUser.id
				});
	const meritRankLevel = resolveMeritRankLevel(totalMerits);

	for (const hasPriority of PREFIX_PRIORITY) {
		const priorityDivision = usersDivisions.find(hasPriority);
		if (priorityDivision?.displayNamePrefix) {
			return {
				newUserNickname: appendMeritRankSuffix({
					nickname: `${priorityDivision.displayNamePrefix} | ${dbUser.discordNickname}`,
					meritRankLevel
				})
			};
		}
	}

	return {
		newUserNickname: appendMeritRankSuffix({
			nickname: dbUser.discordNickname,
			meritRankLevel
		})
	};
};

function appendMeritRankSuffix({ nickname, meritRankLevel }: { nickname: string; meritRankLevel: number | null }) {
	const sanitizedNickname = stripTrailingMeritRankSuffix(nickname);
	if (!meritRankLevel) {
		return sanitizedNickname;
	}

	const meritRankSymbol = getMeritRankSymbol(meritRankLevel);
	if (!meritRankSymbol) {
		return sanitizedNickname;
	}

	const suffix = ` ${meritRankSymbol}`;
	if (sanitizedNickname.length + suffix.length <= MAX_DISCORD_NICKNAME_LENGTH) {
		return `${sanitizedNickname}${suffix}`;
	}

	const truncatedBaseLength = MAX_DISCORD_NICKNAME_LENGTH - suffix.length;
	if (truncatedBaseLength <= 0) {
		return meritRankSymbol;
	}

	return `${sanitizedNickname.slice(0, truncatedBaseLength).trimEnd()}${suffix}`;
}

function stripTrailingMeritRankSuffix(value: string) {
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
