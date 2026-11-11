import { describe, expect, it } from 'vitest';

import { createMeritBadgeRoleMap } from '../../../../../src/config/meritBadgeRoles';
import {
	buildMeritBadgeEarnedDm,
	buildMeritBadgeListFields,
	buildNextMeritBadgeLine,
	resolveMeritBadgeCopy
} from '../../../../../src/lib/services/merit-rank/meritBadgeMessages';

const ALL_ROLES = rolesForTiers(Array.from({ length: 36 }, (_, index) => index + 1));
const NO_ROLES = createMeritBadgeRoleMap(new Map());

describe('meritBadgeMessages', () => {
	it('names the badge and the next badge for a total of 12', () => {
		const copy = resolveMeritBadgeCopy({ totalMerits: 12, badgeRoles: ALL_ROLES });

		expect(copy?.progress.currentTier?.label).toBe('Aes III');
		expect(buildNextMeritBadgeLine(copy!)).toBe('Next badge **Argentum I** in **4 merits**');
		expect(buildMeritBadgeListFields(copy!)).toEqual({
			currentValue: 'Aes III',
			progressValue: ['To Argentum I: [==----------] 20%', '4 merits needed to next badge'].join('\n')
		});
	});

	it('uses badge copy only when the tier the copy is about has a role', () => {
		const ferrumOnly = rolesForTiers([1]);

		expect(resolveMeritBadgeCopy({ totalMerits: 12, badgeRoles: NO_ROLES })).toBeNull();
		expect(resolveMeritBadgeCopy({ totalMerits: 12, badgeRoles: ferrumOnly })).toBeNull();
		expect(resolveMeritBadgeCopy({ totalMerits: 1, badgeRoles: ferrumOnly })?.progress.currentTier?.label).toBe('Ferrum I');
	});

	it('does not promise a next badge whose role is not configured yet', () => {
		// Ferrum I to Aes III have roles; Argentum I does not, so sync could not award it.
		const copy = resolveMeritBadgeCopy({ totalMerits: 12, badgeRoles: rolesForTiers([1, 2, 3, 4, 5, 6]) });

		expect(copy?.canPromiseNextTier).toBe(false);
		expect(buildNextMeritBadgeLine(copy!)).toBeNull();
		expect(buildMeritBadgeListFields(copy!)).toEqual({ currentValue: 'Aes III', progressValue: null });
	});

	it('points a member with no merits at Ferrum I', () => {
		const copy = resolveMeritBadgeCopy({ totalMerits: 0, badgeRoles: ALL_ROLES });

		expect(buildMeritBadgeListFields(copy!)).toEqual({
			currentValue: 'No badge yet',
			progressValue: ['To Ferrum I: [------------] 0%', '1 merit needed to next badge'].join('\n')
		});
	});

	it('says the member holds the highest badge at Supra Omnia III', () => {
		const copy = resolveMeritBadgeCopy({ totalMerits: 2_400, badgeRoles: ALL_ROLES });

		expect(buildNextMeritBadgeLine(copy!)).toBe('You hold the highest merit badge');
		expect(buildMeritBadgeListFields(copy!).progressValue).toBe('Highest badge reached');
		expect(
			buildMeritBadgeEarnedDm({
				earnedTier: copy!.progress.currentTier!,
				currentTotalMerits: 2_400,
				nextLine: 'You hold the highest merit badge.'
			})
		).toBe(
			[
				"Congratulations, Legionnaire! You've earned the **Supra Omnia III** merit badge!",
				'You have **2400 merits** total.',
				'You hold the highest merit badge.'
			].join('\n')
		);
	});
});

function rolesForTiers(tiers: number[]) {
	return createMeritBadgeRoleMap(new Map(tiers.map((tier) => [tier, `${100000000000000000 + tier}`])));
}
