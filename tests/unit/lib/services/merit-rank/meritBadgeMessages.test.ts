import { describe, expect, it } from 'vitest';

import { createMeritBadgeEmojiMap } from '../../../../../src/config/meritBadgeEmojis';
import { createMeritBadgeRoleMap } from '../../../../../src/config/meritBadgeRoles';
import {
	buildMeritBadgeEarnedDm,
	buildMeritBadgeListFields,
	buildNextMeritBadgeLine,
	buildRankUpNextBadgeLine,
	hasEveryMeritBadgeRole,
	resolveMeritBadgeCopy
} from '../../../../../src/lib/services/merit-rank/meritBadgeMessages';

const ALL_ROLES = rolesForTiers(Array.from({ length: 36 }, (_, index) => index + 1));
const NO_ROLES = createMeritBadgeRoleMap(new Map());

describe('meritBadgeMessages', () => {
	it('names the badge and the next badge for a total of 12', () => {
		const copy = resolveMeritBadgeCopy({ totalMerits: 12, badgeRoles: ALL_ROLES });

		expect(copy?.progress.currentTier?.label).toBe('Argentum II');
		expect(buildNextMeritBadgeLine(copy!)).toBe('Next badge **Argentum III** in **2 merits**');
		expect(buildMeritBadgeListFields(copy!)).toEqual({
			currentValue: 'Argentum II',
			progressValue: ['[====--------] 33%', '2 merits to Argentum III'].join('\n')
		});
	});

	it('shows the earned and next badge with their emojis in the DM', () => {
		const copy = resolveMeritBadgeCopy({ totalMerits: 75, badgeRoles: ALL_ROLES })!;
		const badgeEmojis = createMeritBadgeEmojiMap(
			new Map([
				[17, '300000000000000017'],
				[18, '300000000000000018']
			])
		);

		expect(copy.progress.currentTier?.label).toBe('Sapphirus II');
		expect(buildRankUpNextBadgeLine(copy, badgeEmojis)).toBe(
			'Next badge: <:sapphirus_iii:300000000000000018> **Sapphirus III** in **11 merits**'
		);
		expect(
			buildMeritBadgeEarnedDm({
				earnedTier: copy.progress.currentTier!,
				currentTotalMerits: 75,
				nextLine: buildRankUpNextBadgeLine(copy, badgeEmojis)!,
				badgeEmojis
			})
		).toBe(
			[
				"Congratulations, Legionnaire! You've earned the **Sapphirus II** merit badge!",
				'',
				'Your badge: <:sapphirus_ii:300000000000000017> **Sapphirus II**',
				'Next badge: <:sapphirus_iii:300000000000000018> **Sapphirus III** in **11 merits**',
				'',
				'You have **75 merits** total.'
			].join('\n')
		);
	});

	it('puts the emojis on the current badge and around the progress bar in the list fields', () => {
		const copy = resolveMeritBadgeCopy({ totalMerits: 78, badgeRoles: ALL_ROLES })!;
		const badgeEmojis = createMeritBadgeEmojiMap(
			new Map([
				[17, '300000000000000017'],
				[18, '300000000000000018']
			])
		);

		expect(buildMeritBadgeListFields(copy, badgeEmojis)).toEqual({
			currentValue: '<:sapphirus_ii:300000000000000017> Sapphirus II',
			progressValue: [
				'<:sapphirus_ii:300000000000000017> [=====-------] <:sapphirus_iii:300000000000000018> 43%',
				'8 merits to Sapphirus III'
			].join('\n')
		});
	});

	it('skips a missing emoji slot in the list fields, and shows no left emoji before the first badge', () => {
		const nextOnly = createMeritBadgeEmojiMap(new Map([[1, '300000000000000001']]));
		const noBadgeYet = resolveMeritBadgeCopy({ totalMerits: 0, badgeRoles: ALL_ROLES })!;
		const earned = resolveMeritBadgeCopy({ totalMerits: 12, badgeRoles: ALL_ROLES })!;

		expect(buildMeritBadgeListFields(noBadgeYet, nextOnly)).toEqual({
			currentValue: 'No badge yet',
			progressValue: ['[------------] <:ferrum_i:300000000000000001> 0%', '1 merit to Ferrum I'].join('\n')
		});
		expect(buildMeritBadgeListFields(earned, nextOnly).progressValue).toBe(['[====--------] 33%', '2 merits to Argentum III'].join('\n'));
	});

	it('leaves out the emoji for a tier that has none', () => {
		const copy = resolveMeritBadgeCopy({ totalMerits: 75, badgeRoles: ALL_ROLES })!;
		const earnedOnly = createMeritBadgeEmojiMap(new Map([[17, '300000000000000017']]));

		expect(buildRankUpNextBadgeLine(copy, earnedOnly)).toBe('Next badge: **Sapphirus III** in **11 merits**');
		expect(
			buildMeritBadgeEarnedDm({
				earnedTier: copy.progress.currentTier!,
				currentTotalMerits: 75,
				nextLine: buildRankUpNextBadgeLine(copy, earnedOnly)!,
				badgeEmojis: earnedOnly
			})
		).toContain('Your badge: <:sapphirus_ii:300000000000000017> **Sapphirus II**\nNext badge: **Sapphirus III** in **11 merits**');
	});

	it('uses badge copy only when the tier the copy is about has a role', () => {
		const ferrumOnly = rolesForTiers([1]);

		expect(resolveMeritBadgeCopy({ totalMerits: 12, badgeRoles: NO_ROLES })).toBeNull();
		expect(resolveMeritBadgeCopy({ totalMerits: 12, badgeRoles: ferrumOnly })).toBeNull();
		expect(resolveMeritBadgeCopy({ totalMerits: 1, badgeRoles: ferrumOnly })?.progress.currentTier?.label).toBe('Ferrum I');
	});

	it('does not promise a next badge whose role is not configured yet', () => {
		// Ferrum I to Argentum II have roles; Argentum III does not, so sync could not award it.
		const copy = resolveMeritBadgeCopy({ totalMerits: 12, badgeRoles: rolesForTiers([1, 2, 3, 4, 5, 6, 7, 8]) });

		expect(copy?.canPromiseNextTier).toBe(false);
		expect(buildNextMeritBadgeLine(copy!)).toBeNull();
		expect(buildMeritBadgeListFields(copy!)).toEqual({ currentValue: 'Argentum II', progressValue: null });
	});

	it('reports every badge role configured only when all 36 tiers have one', () => {
		expect(hasEveryMeritBadgeRole(ALL_ROLES)).toBe(true);
		expect(hasEveryMeritBadgeRole(rolesForTiers([1, 2, 3, 4, 5, 6]))).toBe(false);
		expect(hasEveryMeritBadgeRole(NO_ROLES)).toBe(false);
	});

	it('points a member with no merits at Ferrum I', () => {
		const copy = resolveMeritBadgeCopy({ totalMerits: 0, badgeRoles: ALL_ROLES });

		expect(buildMeritBadgeListFields(copy!)).toEqual({
			currentValue: 'No badge yet',
			progressValue: ['[------------] 0%', '1 merit to Ferrum I'].join('\n')
		});
	});

	it('says the member holds the highest badge at Supra Omnia III', () => {
		const copy = resolveMeritBadgeCopy({ totalMerits: 2_400, badgeRoles: ALL_ROLES });

		expect(buildRankUpNextBadgeLine(copy!)).toBe('You hold the highest merit badge.');
		expect(buildMeritBadgeListFields(copy!).progressValue).toBe('Highest badge reached');
		expect(
			buildMeritBadgeEarnedDm({
				earnedTier: copy!.progress.currentTier!,
				currentTotalMerits: 2_400,
				nextLine: buildRankUpNextBadgeLine(copy!)!
			})
		).toBe(
			[
				"Congratulations, Legionnaire! You've earned the **Supra Omnia III** merit badge!",
				'',
				'Your badge: **Supra Omnia III**',
				'You hold the highest merit badge.',
				'',
				'You have **2400 merits** total.'
			].join('\n')
		);
	});
});

function rolesForTiers(tiers: number[]) {
	return createMeritBadgeRoleMap(new Map(tiers.map((tier) => [tier, `${100000000000000000 + tier}`])));
}
