import { GuildMember } from 'discord.js';
import type { ContextLogger } from '../../logging/executionContext';

import { resolveMeritRankLevel, resolveMeritRankProgress } from './meritRank';

type NotifyMeritRankUpParams = {
	member: GuildMember;
	previousTotalMerits: number;
	currentTotalMerits: number;
	logger: ContextLogger;
};

export async function notifyMeritRankUp({ member, previousTotalMerits, currentTotalMerits, logger }: NotifyMeritRankUpParams) {
	const previousLevel = resolveMeritRankLevel(previousTotalMerits);
	const currentLevel = resolveMeritRankLevel(currentTotalMerits);

	if (!currentLevel) {
		return false;
	}

	if (previousLevel !== null && currentLevel <= previousLevel) {
		return false;
	}

	const rankProgress = resolveMeritRankProgress(currentTotalMerits);
	const nextRankLine = rankProgress.nextLevel
		? `Next rank level in **${rankProgress.meritsRemainingToNextLevel} merit${rankProgress.meritsRemainingToNextLevel === 1 ? '' : 's'}**.`
		: 'You are at the maximum merit rank level.';

	await member.user
		.send(
			[
				`Congratulations, Legionnaire! You've ranked up to **Level ${currentLevel}**!`,
				`You have **${currentTotalMerits} merits** total.`,
				nextRankLine
			].join('\n')
		)
		.catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					discordUserId: member.id,
					previousTotalMerits,
					currentTotalMerits,
					previousLevel,
					currentLevel
				},
				'Failed to DM merit rank-up notification'
			);
		});

	return true;
}
