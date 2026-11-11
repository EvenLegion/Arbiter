import { GuildMember } from 'discord.js';

import { ENV_MERIT_BADGE_ROLES } from '../../../config/env/discord';
import type { ContextLogger } from '../../logging/executionContext';
import { resolveMeritBadgePromotion } from './meritBadge';
import { buildMeritBadgeEarnedDm, resolveMeritBadgeCopyProgress, type MeritBadgeCopyRoles } from './meritBadgeMessages';
import { resolveMeritRankLevel, resolveMeritRankProgress } from './meritRank';

type NotifyMeritRankUpParams = {
	member: GuildMember;
	previousTotalMerits: number;
	currentTotalMerits: number;
	logger: ContextLogger;
	/** Defaults to the configured badge roles. */
	badgeRoles?: MeritBadgeCopyRoles;
};

/**
 * DMs a member after a promotion. Once the current badge tier's role is configured, the DM is
 * sent on every new badge (D14); before that, it keeps the legacy rank-level copy. A drop never
 * sends a DM. The send is best effort and only logs a warning on failure.
 */
export async function notifyMeritRankUp({
	member,
	previousTotalMerits,
	currentTotalMerits,
	logger,
	badgeRoles = ENV_MERIT_BADGE_ROLES
}: NotifyMeritRankUpParams) {
	const badgeProgress = resolveMeritBadgeCopyProgress({
		totalMerits: currentTotalMerits,
		badgeRoles
	});
	if (badgeProgress) {
		const promotion = resolveMeritBadgePromotion({
			previousTotalMerits,
			currentTotalMerits
		});
		if (!promotion) {
			return false;
		}

		await sendBestEffort({
			member,
			content: buildMeritBadgeEarnedDm({
				earnedTier: promotion.currentTier,
				currentTotalMerits,
				progress: badgeProgress
			}),
			logger,
			logFields: {
				previousTotalMerits,
				currentTotalMerits,
				previousTier: promotion.previousTier?.tier ?? null,
				currentTier: promotion.currentTier.tier
			},
			logMessage: 'Failed to DM merit badge notification'
		});

		return true;
	}

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

	await sendBestEffort({
		member,
		content: [
			`Congratulations, Legionnaire! You've ranked up to **Level ${currentLevel}**!`,
			`You have **${currentTotalMerits} merits** total.`,
			nextRankLine
		].join('\n'),
		logger,
		logFields: {
			previousTotalMerits,
			currentTotalMerits,
			previousLevel,
			currentLevel
		},
		logMessage: 'Failed to DM merit rank-up notification'
	});

	return true;
}

async function sendBestEffort({
	member,
	content,
	logger,
	logFields,
	logMessage
}: {
	member: GuildMember;
	content: string;
	logger: ContextLogger;
	logFields: Record<string, number | null>;
	logMessage: string;
}) {
	await member.user.send(content).catch((error: unknown) => {
		logger.warn(
			{
				err: error,
				discordUserId: member.id,
				...logFields
			},
			logMessage
		);
	});
}
