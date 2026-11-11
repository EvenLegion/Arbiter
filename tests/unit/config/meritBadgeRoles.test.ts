import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MERIT_BADGE_ROLE_ENV_NAMES, createMeritBadgeRoleMap, parseMeritBadgeRoleIds } from '../../../src/config/meritBadgeRoles';

// Dummy snowflake-shaped IDs; they do not exist in any guild.
const dummyRoleId = (tier: number) => `1000000000000000${String(tier).padStart(3, '0')}`;

function envWithTiers(tiers: number[]) {
	return Object.fromEntries(tiers.map((tier) => [MERIT_BADGE_ROLE_ENV_NAMES[tier - 1], dummyRoleId(tier)]));
}

const ALL_TIERS = Array.from({ length: 36 }, (_, index) => index + 1);

describe('merit badge role variable names', () => {
	it('generates one name per tier from the badge ladder', () => {
		expect(MERIT_BADGE_ROLE_ENV_NAMES).toHaveLength(36);
		expect(new Set(MERIT_BADGE_ROLE_ENV_NAMES).size).toBe(36);
		expect(MERIT_BADGE_ROLE_ENV_NAMES[0]).toBe('MERIT_BADGE_FERRUM_I_ROLE_ID');
		expect(MERIT_BADGE_ROLE_ENV_NAMES[1]).toBe('MERIT_BADGE_FERRUM_II_ROLE_ID');
		expect(MERIT_BADGE_ROLE_ENV_NAMES[21]).toBe('MERIT_BADGE_ADAMAS_I_ROLE_ID');
		expect(MERIT_BADGE_ROLE_ENV_NAMES[35]).toBe('MERIT_BADGE_SUPRA_OMNIA_III_ROLE_ID');
	});

	it('lists every badge role variable in .env.example, unset', () => {
		const exampleLines = readFileSync(join(__dirname, '../../../.env.example'), 'utf8').split('\n');
		const badgeLines = exampleLines.filter((line) => line.startsWith('MERIT_BADGE_'));

		expect(badgeLines).toEqual(MERIT_BADGE_ROLE_ENV_NAMES.map((name) => `${name}=`));
	});
});

describe('parseMeritBadgeRoleIds', () => {
	it('reads all 36 tiers', () => {
		const result = parseMeritBadgeRoleIds(envWithTiers(ALL_TIERS));

		expect(result.issues).toEqual([]);
		expect([...result.roleIdsByTier.entries()]).toEqual(ALL_TIERS.map((tier) => [tier, dummyRoleId(tier)]));
	});

	it('treats unset and empty variables as not configured', () => {
		expect(parseMeritBadgeRoleIds({})).toEqual({ roleIdsByTier: new Map(), issues: [] });
		expect(
			parseMeritBadgeRoleIds({ MERIT_BADGE_FERRUM_I_ROLE_ID: '', MERIT_BADGE_FERRUM_II_ROLE_ID: '   ', MERIT_BADGE_AES_I_ROLE_ID: undefined })
		).toEqual({ roleIdsByTier: new Map(), issues: [] });
	});

	it('allows a prefix of the ladder', () => {
		const result = parseMeritBadgeRoleIds(envWithTiers([1, 2, 3, 4, 5, 6, 7, 8, 9]));

		expect(result.issues).toEqual([]);
		expect([...result.roleIdsByTier.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	it('trims surrounding whitespace', () => {
		const result = parseMeritBadgeRoleIds({ MERIT_BADGE_FERRUM_I_ROLE_ID: ` ${dummyRoleId(1)} ` });

		expect(result.roleIdsByTier.get(1)).toBe(dummyRoleId(1));
	});

	it('rejects the same role ID on two tiers', () => {
		const result = parseMeritBadgeRoleIds({ MERIT_BADGE_FERRUM_I_ROLE_ID: dummyRoleId(1), MERIT_BADGE_AES_II_ROLE_ID: dummyRoleId(1) });

		expect(result.issues).toEqual([
			'MERIT_BADGE_AES_II_ROLE_ID: uses the same role ID as MERIT_BADGE_FERRUM_I_ROLE_ID; each badge tier needs its own role'
		]);
	});

	it.each(['not-a-role', '12345', '1234567890123456789012', '-100000000000000001', '1e20'])('rejects %s as a role ID', (value) => {
		expect(parseMeritBadgeRoleIds({ MERIT_BADGE_FERRUM_I_ROLE_ID: value }).issues).toEqual([
			'MERIT_BADGE_FERRUM_I_ROLE_ID: must be a Discord role ID (17 to 20 digits)'
		]);
	});

	it('rejects a variable that names no badge tier', () => {
		const result = parseMeritBadgeRoleIds({
			MERIT_BADGE_FERUM_I_ROLE_ID: dummyRoleId(1),
			MERIT_BADGE_SUPRA_OMNIA_IV_ROLE_ID: dummyRoleId(37),
			MERIT_BADGE_UNUSED_ROLE_ID: ''
		});

		expect(result.issues).toHaveLength(2);
		expect(result.issues[0]).toMatch(/^MERIT_BADGE_FERUM_I_ROLE_ID: unknown merit badge tier/);
		expect(result.issues[1]).toMatch(/^MERIT_BADGE_SUPRA_OMNIA_IV_ROLE_ID: unknown merit badge tier/);
	});

	it('rejects a badge role ID that is already another configured role', () => {
		const result = parseMeritBadgeRoleIds({ LGN_ROLE_ID: dummyRoleId(1), PRA_ROLE_ID: '', MERIT_BADGE_FERRUM_I_ROLE_ID: dummyRoleId(1) });

		expect(result.issues).toEqual(['MERIT_BADGE_FERRUM_I_ROLE_ID: uses the same role ID as LGN_ROLE_ID; badge roles must be separate roles']);
		expect(parseMeritBadgeRoleIds({ MERIT_BADGE_FERRUM_I_ROLE_ID: dummyRoleId(1), PRA_ROLE_ID: '' }).issues).toEqual([]);
	});
});

describe('createMeritBadgeRoleMap', () => {
	it('is disabled with no configured tier', () => {
		const roleMap = createMeritBadgeRoleMap(new Map());

		expect(roleMap.isEnabled).toBe(false);
		expect(roleMap.roleIds.size).toBe(0);
		expect(roleMap.resolveConfiguredRoleAtOrBelow(36)).toBeNull();
	});

	it('looks roles up by tier and by role ID', () => {
		const roleMap = createMeritBadgeRoleMap(parseMeritBadgeRoleIds(envWithTiers(ALL_TIERS)).roleIdsByTier);

		expect(roleMap.isEnabled).toBe(true);
		expect(roleMap.roleIds).toEqual(new Set(ALL_TIERS.map(dummyRoleId)));
		expect(roleMap.byTier(22)).toBe(dummyRoleId(22));
		expect(roleMap.byTier(37)).toBeNull();
		expect(roleMap.byRoleId(dummyRoleId(22))?.label).toBe('Adamas I');
		expect(roleMap.byRoleId('999999999999999999')).toBeNull();
	});

	it('falls back to the highest configured tier at or below the target', () => {
		const roleMap = createMeritBadgeRoleMap(parseMeritBadgeRoleIds(envWithTiers([1, 2, 3, 4, 5, 6, 7, 8, 9, 14])).roleIdsByTier);

		expect(roleMap.resolveConfiguredRoleAtOrBelow(9)).toEqual({ tier: expect.objectContaining({ tier: 9 }), roleId: dummyRoleId(9) });
		expect(roleMap.resolveConfiguredRoleAtOrBelow(12)?.tier.label).toBe('Argentum III');
		expect(roleMap.resolveConfiguredRoleAtOrBelow(14)?.roleId).toBe(dummyRoleId(14));
		expect(roleMap.resolveConfiguredRoleAtOrBelow(36)?.roleId).toBe(dummyRoleId(14));
		expect(roleMap.resolveConfiguredRoleAtOrBelow(0)).toBeNull();
	});

	it('returns no fallback when only higher tiers are configured', () => {
		const roleMap = createMeritBadgeRoleMap(parseMeritBadgeRoleIds(envWithTiers([10, 11])).roleIdsByTier);

		expect(roleMap.resolveConfiguredRoleAtOrBelow(9)).toBeNull();
		expect(roleMap.resolveConfiguredRoleAtOrBelow(10)?.roleId).toBe(dummyRoleId(10));
	});
});
