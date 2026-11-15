import type { MeritBadgeRoleMap } from '../../../config/meritBadgeRoles';
import { MAX_MERIT_BADGE_TIER, resolveMeritBadgeProgress, type MeritBadgeProgress, type MeritBadgeTier } from './meritBadge';
import { buildMeritRankProgressBar } from './meritRank';

/** The part of the badge role map that member copy needs: which tiers have a role. */
export type MeritBadgeCopyRoles = Pick<MeritBadgeRoleMap, 'byTier'>;

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

/** The DM a member gets for every new badge (D14). `nextLine` ends the message as given. */
export function buildMeritBadgeEarnedDm({
	earnedTier,
	currentTotalMerits,
	nextLine
}: {
	earnedTier: MeritBadgeTier;
	currentTotalMerits: number;
	nextLine: string;
}) {
	return [
		`Congratulations, Legionnaire! You've earned the **${earnedTier.label}** merit badge!`,
		`You have **${currentTotalMerits} merits** total.`,
		nextLine
	].join('\n');
}

/**
 * The current badge and progress values for the `/merit list` embed. `progressValue` is null
 * when the next badge has no role yet, so the caller keeps the legacy progress field.
 */
export function buildMeritBadgeListFields({ progress, canPromiseNextTier }: MeritBadgeCopy) {
	const currentValue = progress.currentTier?.label ?? 'No badge yet';

	if (!progress.nextTier || progress.meritsRemainingToNextTier === null) {
		return { currentValue, progressValue: 'Highest badge reached' };
	}
	if (!canPromiseNextTier) {
		return { currentValue, progressValue: null };
	}

	return {
		currentValue,
		progressValue: [
			`To ${progress.nextTier.label}: ${buildMeritRankProgressBar({ progressRatio: progress.progressRatio })} ${progress.progressPercent}%`,
			`${formatMeritCount(progress.meritsRemainingToNextTier)} needed to next badge`
		].join('\n')
	};
}

function formatMeritCount(count: number) {
	return `${count} merit${count === 1 ? '' : 's'}`;
}
