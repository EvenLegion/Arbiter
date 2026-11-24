import type { MeritBadgeEmojiMap } from '../../../config/meritBadgeEmojis';
import type { MeritBadgeRoleMap } from '../../../config/meritBadgeRoles';
import { MAX_MERIT_BADGE_TIER, resolveMeritBadgeProgress, type MeritBadgeProgress, type MeritBadgeTier } from './meritBadge';
import { buildMeritRankProgressBar } from './meritRank';

/** The part of the badge role map that member copy needs: which tiers have a role. */
export type MeritBadgeCopyRoles = Pick<MeritBadgeRoleMap, 'byTier'>;

/** The part of the badge emoji map that member copy needs: the emoji mention for a tier, if it has one. */
export type MeritBadgeCopyEmojis = Pick<MeritBadgeEmojiMap, 'byTier'>;

/** The emoji mention for a tier, or null when the tier has none configured. */
function resolveEmoji(tier: MeritBadgeTier | null, badgeEmojis: MeritBadgeCopyEmojis | undefined) {
	return tier ? (badgeEmojis?.byTier(tier.tier) ?? null) : null;
}

/** "<emoji> " for a tier with a configured emoji, otherwise an empty string so the badge name stands alone. */
function formatEmojiPrefix(tier: MeritBadgeTier, badgeEmojis: MeritBadgeCopyEmojis | undefined) {
	const emoji = resolveEmoji(tier, badgeEmojis);
	return emoji ? `${emoji} ` : '';
}

/**
 * True once every badge tier has a role. Staff views that name every tier, such as
 * `/merit rank_list` and its command description, keep the legacy copy until then.
 */
export function hasEveryMeritBadgeRole(roleMap: Pick<MeritBadgeRoleMap, 'configuredRoles'>) {
	return roleMap.configuredRoles.length === MAX_MERIT_BADGE_TIER;
}

export type MeritBadgeCopy = Readonly<{
	progress: MeritBadgeProgress;
	/**
	 * False while the next badge has no role yet. Role sync cannot award that badge, so
	 * next-badge copy must not promise it; callers keep the legacy progress copy instead.
	 */
	canPromiseNextTier: boolean;
}>;

/**
 * Returns badge copy inputs for a total when member copy should talk about badges, otherwise null.
 *
 * Copy is about the member's current badge tier, or Ferrum I while they have none. Badge copy is
 * used only when that tier's role is configured, so copy stays unchanged until roles exist.
 * Next-badge copy is gated separately on the next tier's role (`canPromiseNextTier`).
 */
export function resolveMeritBadgeCopy({ totalMerits, badgeRoles }: { totalMerits: number; badgeRoles: MeritBadgeCopyRoles }): MeritBadgeCopy | null {
	const progress = resolveMeritBadgeProgress(totalMerits);
	const copyTier = progress.currentTier ?? progress.nextTier;
	if (!copyTier || badgeRoles.byTier(copyTier.tier) === null) {
		return null;
	}

	return {
		progress,
		canPromiseNextTier: progress.nextTier === null || badgeRoles.byTier(progress.nextTier.tier) !== null
	};
}

/**
 * For example "Next badge **Argentum I** in **4 merits**", with no trailing period.
 * Returns null when the next badge has no role yet, so the caller keeps its legacy line.
 */
export function buildNextMeritBadgeLine({ progress, canPromiseNextTier }: MeritBadgeCopy) {
	if (!progress.nextTier || progress.meritsRemainingToNextTier === null) {
		return 'You hold the highest merit badge';
	}
	if (!canPromiseNextTier) {
		return null;
	}

	return `Next badge **${progress.nextTier.label}** in **${formatMeritCount(progress.meritsRemainingToNextTier)}**`;
}

/**
 * The next-badge line for the rank-up DM: "Next badge: <emoji> **Argentum I** in **4 merits**", with the
 * emoji only when that tier has one. At the top badge it is "You hold the highest merit badge."
 * Returns null when the next badge has no role yet, so the caller keeps its legacy line.
 */
export function buildRankUpNextBadgeLine({ progress, canPromiseNextTier }: MeritBadgeCopy, badgeEmojis?: MeritBadgeCopyEmojis) {
	if (!progress.nextTier || progress.meritsRemainingToNextTier === null) {
		return 'You hold the highest merit badge.';
	}
	if (!canPromiseNextTier) {
		return null;
	}

	const emoji = formatEmojiPrefix(progress.nextTier, badgeEmojis);
	return `Next badge: ${emoji}**${progress.nextTier.label}** in **${formatMeritCount(progress.meritsRemainingToNextTier)}**`;
}

/**
 * The DM a member gets for every new badge (D14): the congratulation, then the badge just earned and the
 * next badge (each with its emoji when configured), then the merit total. `nextLine` is used as given.
 */
export function buildMeritBadgeEarnedDm({
	earnedTier,
	currentTotalMerits,
	nextLine,
	badgeEmojis
}: {
	earnedTier: MeritBadgeTier;
	currentTotalMerits: number;
	nextLine: string;
	badgeEmojis?: MeritBadgeCopyEmojis;
}) {
	return [
		`Congratulations, Legionnaire! You've earned the **${earnedTier.label}** merit badge!`,
		'',
		`Your badge: ${formatEmojiPrefix(earnedTier, badgeEmojis)}**${earnedTier.label}**`,
		nextLine,
		'',
		`You have **${currentTotalMerits} merits** total.`
	].join('\n');
}

/**
 * The current badge and progress values for the `/merit list` embed. `progressValue` is null
 * when the next badge has no role yet, so the caller keeps the legacy progress field.
 *
 * With emojis configured, the current badge shows its emoji before its name, and the progress is
 * "<current emoji> [bar] <next emoji> 43%" over "8 merits to Sapphirus III". A tier without an emoji
 * leaves its slot out, so the line still reads cleanly.
 */
export function buildMeritBadgeListFields({ progress, canPromiseNextTier }: MeritBadgeCopy, badgeEmojis?: MeritBadgeCopyEmojis) {
	const currentEmoji = resolveEmoji(progress.currentTier, badgeEmojis);
	const currentValue = progress.currentTier ? `${currentEmoji ? `${currentEmoji} ` : ''}${progress.currentTier.label}` : 'No badge yet';

	if (!progress.nextTier || progress.meritsRemainingToNextTier === null) {
		return { currentValue, progressValue: 'Highest badge reached' };
	}
	if (!canPromiseNextTier) {
		return { currentValue, progressValue: null };
	}

	const nextEmoji = resolveEmoji(progress.nextTier, badgeEmojis);
	const barLine = [currentEmoji, buildMeritRankProgressBar({ progressRatio: progress.progressRatio }), nextEmoji, `${progress.progressPercent}%`]
		.filter(Boolean)
		.join(' ');

	return {
		currentValue,
		progressValue: [barLine, `${formatMeritCount(progress.meritsRemainingToNextTier)} to ${progress.nextTier.label}`].join('\n')
	};
}

function formatMeritCount(count: number) {
	return `${count} merit${count === 1 ? '' : 's'}`;
}
