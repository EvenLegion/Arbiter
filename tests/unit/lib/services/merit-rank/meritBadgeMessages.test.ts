import { describe, expect, it } from 'vitest';

import { createMeritBadgeRoleMap } from '../../../../../src/config/meritBadgeRoles';
import {
	buildMeritBadgeEarnedDm,
	buildMeritBadgeListFields,
	buildNextMeritBadgeLine,
	resolveMeritBadgeCopyProgress
} from '../../../../../src/lib/services/merit-rank/meritBadgeMessages';

const ALL_ROLES = createMeritBadgeRoleMap(new Map(Array.from({ length: 36 }, (_, index) => [index + 1, `${100000000000000000 + index}`])));
const NO_ROLES = createMeritBadgeRoleMap(new Map());

describe('meritBadgeMessages', () => {
	it('names the badge and the next badge for a total of 12', () => {
		const progress = resolveMeritBadgeCopyProgress({ totalMerits: 12, badgeRoles: ALL_ROLES });

		expect(progress?.currentTier?.label).toBe('Aes III');
		expect(buildNextMeritBadgeLine(progress!)).toBe('Next badge **Argentum I** in **4 merits**');
		expect(buildMeritBadgeListFields(progress!)).toEqual({
			currentValue: 'Aes III',
			progressValue: ['To Argentum I: [==----------] 20%', '4 merits needed to next badge'].join('\n')
		});
	});

	it('uses badge copy only when the tier the copy is about has a role', () => {
		const ferrumOnly = createMeritBadgeRoleMap(new Map([[1, '100000000000000001']]));

		expect(resolveMeritBadgeCopyProgress({ totalMerits: 12, badgeRoles: NO_ROLES })).toBeNull();
		expect(resolveMeritBadgeCopyProgress({ totalMerits: 12, badgeRoles: ferrumOnly })).toBeNull();
		expect(resolveMeritBadgeCopyProgress({ totalMerits: 1, badgeRoles: ferrumOnly })?.currentTier?.label).toBe('Ferrum I');
	});

	it('points a member with no merits at Ferrum I', () => {
		const progress = resolveMeritBadgeCopyProgress({ totalMerits: 0, badgeRoles: ALL_ROLES });

		expect(buildMeritBadgeListFields(progress!)).toEqual({
			currentValue: 'No badge yet',
			progressValue: ['To Ferrum I: [------------] 0%', '1 merit needed to next badge'].join('\n')
		});
	});

	it('says the member holds the highest badge at Supra Omnia III', () => {
		const progress = resolveMeritBadgeCopyProgress({ totalMerits: 2_400, badgeRoles: ALL_ROLES });

		expect(buildNextMeritBadgeLine(progress!)).toBe('You hold the highest merit badge');
		expect(buildMeritBadgeListFields(progress!).progressValue).toBe('Highest badge reached');
		expect(
			buildMeritBadgeEarnedDm({
				earnedTier: progress!.currentTier!,
				currentTotalMerits: 2_400,
				progress: progress!
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
