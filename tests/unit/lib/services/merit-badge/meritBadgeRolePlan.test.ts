import { describe, expect, it } from 'vitest';

import { createMeritBadgeRoleMap } from '../../../../../src/config/meritBadgeRoles';
import { isMeritBadgeRolePlanNoOp, planMeritBadgeRoles } from '../../../../../src/lib/services/merit-badge/meritBadgeRolePlan';

// Tiers: 1 Ferrum I (1), 2 Ferrum II (2), 3 Ferrum III (3), 4 Aes I (5), 5 Aes II (8), 6 Aes III (11).
const FERRUM_I = '200000000000000001';
const FERRUM_II = '200000000000000002';
const AES_I = '200000000000000004';
const AES_III = '200000000000000006';
const DIVISION_ROLE = '300000000000000001';

// Ferrum III and Aes II are deliberately not configured.
const roleMap = createMeritBadgeRoleMap(
	new Map([
		[1, FERRUM_I],
		[2, FERRUM_II],
		[4, AES_I],
		[6, AES_III]
	])
);

function plan(totalMerits: number, currentRoleIds: string[]) {
	const result = planMeritBadgeRoles({ totalMerits, currentRoleIds, roleMap });
	return {
		desiredTier: result.desiredTier?.label ?? null,
		appliedTier: result.appliedTier?.label ?? null,
		tierRoleMissing: result.tierRoleMissing,
		previousTier: result.previousTier?.label ?? null,
		roleIdToAdd: result.roleIdToAdd,
		roleIdsToRemove: [...result.roleIdsToRemove],
		noOp: isMeritBadgeRolePlanNoOp(result)
	};
}

describe('planMeritBadgeRoles', () => {
	it.each([
		{
			name: 'adds the first badge to a member with none',
			total: 1,
			held: [DIVISION_ROLE],
			expected: {
				desiredTier: 'Ferrum I',
				appliedTier: 'Ferrum I',
				tierRoleMissing: false,
				previousTier: null,
				roleIdToAdd: FERRUM_I,
				roleIdsToRemove: [],
				noOp: false
			}
		},
		{
			name: 'does nothing when the member already holds exactly the right badge',
			total: 5,
			held: [DIVISION_ROLE, AES_I],
			expected: {
				desiredTier: 'Aes I',
				appliedTier: 'Aes I',
				tierRoleMissing: false,
				previousTier: 'Aes I',
				roleIdToAdd: null,
				roleIdsToRemove: [],
				noOp: true
			}
		},
		{
			name: 'swaps the old badge for the new one on a promotion',
			total: 11,
			held: [AES_I],
			expected: {
				desiredTier: 'Aes III',
				appliedTier: 'Aes III',
				tierRoleMissing: false,
				previousTier: 'Aes I',
				roleIdToAdd: AES_III,
				roleIdsToRemove: [AES_I],
				noOp: false
			}
		},
		{
			name: 'drops one section after a demerit below the floor (D1)',
			total: 10,
			held: [AES_III],
			// Aes II (8) is unconfigured, so the applied tier falls back to Aes I.
			expected: {
				desiredTier: 'Aes II',
				appliedTier: 'Aes I',
				tierRoleMissing: true,
				previousTier: 'Aes III',
				roleIdToAdd: AES_I,
				roleIdsToRemove: [AES_III],
				noOp: false
			}
		},
		{
			name: 'falls back to the highest configured tier below an unconfigured target',
			total: 3,
			held: [],
			expected: {
				desiredTier: 'Ferrum III',
				appliedTier: 'Ferrum II',
				tierRoleMissing: true,
				previousTier: null,
				roleIdToAdd: FERRUM_II,
				roleIdsToRemove: [],
				noOp: false
			}
		},
		{
			name: 'keeps a fallback badge without calls while the target is still unconfigured',
			total: 3,
			held: [FERRUM_II],
			expected: {
				desiredTier: 'Ferrum III',
				appliedTier: 'Ferrum II',
				tierRoleMissing: true,
				previousTier: 'Ferrum II',
				roleIdToAdd: null,
				roleIdsToRemove: [],
				noOp: true
			}
		},
		{
			name: 'removes duplicate badge roles and keeps the right one',
			total: 6,
			held: [FERRUM_I, AES_I, FERRUM_II, AES_III],
			expected: {
				desiredTier: 'Aes I',
				appliedTier: 'Aes I',
				tierRoleMissing: false,
				previousTier: 'Aes III',
				roleIdToAdd: null,
				roleIdsToRemove: [FERRUM_I, FERRUM_II, AES_III],
				noOp: false
			}
		},
		{
			name: 'removes every badge at zero merits',
			total: 0,
			held: [FERRUM_I, DIVISION_ROLE],
			expected: {
				desiredTier: null,
				appliedTier: null,
				tierRoleMissing: false,
				previousTier: 'Ferrum I',
				roleIdToAdd: null,
				roleIdsToRemove: [FERRUM_I],
				noOp: false
			}
		},
		{
			name: 'removes every badge at a negative total',
			total: -4,
			held: [AES_I],
			expected: {
				desiredTier: null,
				appliedTier: null,
				tierRoleMissing: false,
				previousTier: 'Aes I',
				roleIdToAdd: null,
				roleIdsToRemove: [AES_I],
				noOp: false
			}
		},
		{
			name: 'does nothing for a member with no merits and no badge',
			total: 0,
			held: [DIVISION_ROLE],
			expected: {
				desiredTier: null,
				appliedTier: null,
				tierRoleMissing: false,
				previousTier: null,
				roleIdToAdd: null,
				roleIdsToRemove: [],
				noOp: true
			}
		},
		{
			name: 'applies the top configured tier far above the configured ladder',
			total: 2000,
			held: [FERRUM_I],
			expected: {
				desiredTier: 'Supra Omnia III',
				appliedTier: 'Aes III',
				tierRoleMissing: true,
				previousTier: 'Ferrum I',
				roleIdToAdd: AES_III,
				roleIdsToRemove: [FERRUM_I],
				noOp: false
			}
		}
	])('$name', ({ total, held, expected }) => {
		expect(plan(total, held)).toEqual(expected);
	});

	it('removes badges when the earned tier is below every configured tier', () => {
		const aesOnly = createMeritBadgeRoleMap(new Map([[4, AES_I]]));
		const result = planMeritBadgeRoles({ totalMerits: 2, currentRoleIds: [AES_I], roleMap: aesOnly });

		expect(result.desiredTier?.label).toBe('Ferrum II');
		expect(result.appliedTier).toBeNull();
		expect(result.tierRoleMissing).toBe(true);
		expect(result.roleIdToAdd).toBeNull();
		expect(result.roleIdsToRemove).toEqual([AES_I]);
	});

	it('never plans to touch a role that is not a configured badge role', () => {
		const result = planMeritBadgeRoles({ totalMerits: 0, currentRoleIds: [DIVISION_ROLE, '300000000000000002'], roleMap });

		expect(isMeritBadgeRolePlanNoOp(result)).toBe(true);
	});

	it('treats a non-finite total as no badge', () => {
		expect(planMeritBadgeRoles({ totalMerits: Number.NaN, currentRoleIds: [], roleMap }).desiredTier).toBeNull();
	});
});
