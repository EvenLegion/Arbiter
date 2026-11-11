import type { MeritBadgeRoleMap } from '../../../config/meritBadgeRoles';
import { resolveMeritBadgeProgress, type MeritBadgeProgress, type MeritBadgeTier } from './meritBadge';
import { buildMeritRankProgressBar } from './meritRank';

/** The part of the badge role map that member copy needs: which tiers have a role. */
export type MeritBadgeCopyRoles = Pick<MeritBadgeRoleMap, 'byTier'>;

/**
 * Returns the badge progress for a total when member copy should talk about badges, otherwise null.
 *
 * Copy is about the member's current badge tier, or Ferrum I while they have none. Badge copy is
 * used only when that tier's role is configured, so copy stays unchanged until roles exist.
 */
export function resolveMeritBadgeCopyProgress({
	totalMerits,
	badgeRoles
}: {
	totalMerits: number;
	badgeRoles: MeritBadgeCopyRoles;
}): MeritBadgeProgress | null {
	const progress = resolveMeritBadgeProgress(totalMerits);
	const copyTier = progress.currentTier ?? progress.nextTier;

	return copyTier && badgeRoles.byTier(copyTier.tier) !== null ? progress : null;
}

/** For example "Next badge **Argentum I** in **4 merits**". No trailing period. */
export function buildNextMeritBadgeLine(progress: MeritBadgeProgress) {
	if (!progress.nextTier || progress.meritsRemainingToNextTier === null) {
		return 'You hold the highest merit badge';
	}

	return `Next badge **${progress.nextTier.label}** in **${formatMeritCount(progress.meritsRemainingToNextTier)}**`;
}

/** The DM a member gets for every new badge (D14). */
export function buildMeritBadgeEarnedDm({
	earnedTier,
	currentTotalMerits,
	progress
}: {
	earnedTier: MeritBadgeTier;
	currentTotalMerits: number;
	progress: MeritBadgeProgress;
}) {
	return [
		`Congratulations, Legionnaire! You've earned the **${earnedTier.label}** merit badge!`,
		`You have **${currentTotalMerits} merits** total.`,
		`${buildNextMeritBadgeLine(progress)}.`
	].join('\n');
}

/** The current badge and progress values for the `/merit list` embed. */
export function buildMeritBadgeListFields(progress: MeritBadgeProgress) {
	const currentValue = progress.currentTier?.label ?? 'No badge yet';
	const progressValue =
		progress.nextTier && progress.meritsRemainingToNextTier !== null
			? [
					`To ${progress.nextTier.label}: ${buildMeritRankProgressBar({ progressRatio: progress.progressRatio })} ${progress.progressPercent}%`,
					`${formatMeritCount(progress.meritsRemainingToNextTier)} needed to next badge`
				].join('\n')
			: 'Highest badge reached';

	return { currentValue, progressValue };
}

function formatMeritCount(count: number) {
	return `${count} merit${count === 1 ? '' : 's'}`;
}
