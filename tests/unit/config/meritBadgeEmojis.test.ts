import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	MERIT_BADGE_EMOJI_ENV_NAMES,
	createMeritBadgeEmojiMap,
	getMeritBadgeEmojiName,
	parseMeritBadgeEmojiIds
} from '../../../src/config/meritBadgeEmojis';

// Dummy snowflake-shaped IDs; they do not exist in any guild.
const dummyEmojiId = (tier: number) => `2000000000000000${String(tier).padStart(3, '0')}`;

function envWithTiers(tiers: number[]) {
	return Object.fromEntries(tiers.map((tier) => [MERIT_BADGE_EMOJI_ENV_NAMES[tier - 1], dummyEmojiId(tier)]));
}

const ALL_TIERS = Array.from({ length: 36 }, (_, index) => index + 1);

describe('merit badge emoji variable names', () => {
	it('generates one name per tier from the badge ladder', () => {
		expect(MERIT_BADGE_EMOJI_ENV_NAMES).toHaveLength(36);
		expect(new Set(MERIT_BADGE_EMOJI_ENV_NAMES).size).toBe(36);
		expect(MERIT_BADGE_EMOJI_ENV_NAMES[0]).toBe('MERIT_BADGE_FERRUM_I_EMOJI_ID');
		expect(MERIT_BADGE_EMOJI_ENV_NAMES[21]).toBe('MERIT_BADGE_ADAMAS_I_EMOJI_ID');
		expect(MERIT_BADGE_EMOJI_ENV_NAMES[35]).toBe('MERIT_BADGE_SUPRA_OMNIA_III_EMOJI_ID');
	});

	it('lists every badge emoji variable in .env.example, unset', () => {
		const exampleLines = readFileSync(join(__dirname, '../../../.env.example'), 'utf8').split(/\r?\n/);
		const emojiLines = exampleLines.filter((line) => line.startsWith('MERIT_BADGE_') && line.includes('_EMOJI_ID='));

		expect(emojiLines).toEqual(MERIT_BADGE_EMOJI_ENV_NAMES.map((name) => `${name}=`));
	});

	it('names each emoji after its tier, in lower case with underscores', () => {
		const map = createMeritBadgeEmojiMap(new Map(ALL_TIERS.map((tier) => [tier, dummyEmojiId(tier)])));

		expect(map.byTier(1)).toBe(`<:ferrum_i:${dummyEmojiId(1)}>`);
		expect(map.byTier(36)).toBe(`<:supra_omnia_iii:${dummyEmojiId(36)}>`);
		expect(getMeritBadgeEmojiName({ label: 'Adamas II' })).toBe('adamas_ii');
	});
});

describe('parseMeritBadgeEmojiIds', () => {
	it('reads all 36 tiers', () => {
		const result = parseMeritBadgeEmojiIds(envWithTiers(ALL_TIERS));

		expect(result.issues).toEqual([]);
		expect([...result.emojiIdsByTier.entries()]).toEqual(ALL_TIERS.map((tier) => [tier, dummyEmojiId(tier)]));
	});

	it('treats unset and empty variables as not configured', () => {
		expect(parseMeritBadgeEmojiIds({})).toEqual({ emojiIdsByTier: new Map(), issues: [] });
		expect(
			parseMeritBadgeEmojiIds({
				MERIT_BADGE_FERRUM_I_EMOJI_ID: '',
				MERIT_BADGE_AES_I_EMOJI_ID: '   ',
				MERIT_BADGE_AES_II_EMOJI_ID: undefined
			})
		).toEqual({ emojiIdsByTier: new Map(), issues: [] });
	});

	it('trims surrounding whitespace', () => {
		const result = parseMeritBadgeEmojiIds({ MERIT_BADGE_FERRUM_I_EMOJI_ID: ` ${dummyEmojiId(1)} ` });

		expect(result.emojiIdsByTier.get(1)).toBe(dummyEmojiId(1));
	});

	it('rejects the same emoji ID on two tiers', () => {
		const result = parseMeritBadgeEmojiIds({ MERIT_BADGE_FERRUM_I_EMOJI_ID: dummyEmojiId(1), MERIT_BADGE_AES_II_EMOJI_ID: dummyEmojiId(1) });

		expect(result.issues).toEqual([
			'MERIT_BADGE_AES_II_EMOJI_ID: uses the same emoji ID as MERIT_BADGE_FERRUM_I_EMOJI_ID; each badge tier needs its own emoji'
		]);
		expect(result.emojiIdsByTier.has(4)).toBe(false);
	});

	it.each(['not-an-id', '12345', '1234567890123456789012', '-200000000000000001', '1e20', '<:ferrum_i:200000000000000001>'])(
		'rejects %s as an emoji ID',
		(value) => {
			expect(parseMeritBadgeEmojiIds({ MERIT_BADGE_FERRUM_I_EMOJI_ID: value }).issues).toEqual([
				'MERIT_BADGE_FERRUM_I_EMOJI_ID: must be a Discord emoji ID (17 to 20 digits)'
			]);
		}
	);

	it('rejects a variable that names no badge tier', () => {
		const result = parseMeritBadgeEmojiIds({
			MERIT_BADGE_FERUM_I_EMOJI_ID: dummyEmojiId(1),
			MERIT_BADGE_SUPRA_OMNIA_IV_EMOJI_ID: dummyEmojiId(37),
			MERIT_BADGE_UNUSED_EMOJI_ID: ''
		});

		expect(result.issues).toHaveLength(2);
		expect(result.issues[0]).toMatch(/^MERIT_BADGE_FERUM_I_EMOJI_ID: unknown merit badge tier/);
		expect(result.issues[1]).toMatch(/^MERIT_BADGE_SUPRA_OMNIA_IV_EMOJI_ID: unknown merit badge tier/);
	});

	it('ignores the badge role variables', () => {
		expect(
			parseMeritBadgeEmojiIds({ MERIT_BADGE_FERRUM_I_ROLE_ID: '100000000000000001', MERIT_BADGE_DIVIDER_ROLE_ID: '100000000000000002' })
		).toEqual({ emojiIdsByTier: new Map(), issues: [] });
	});
});

describe('createMeritBadgeEmojiMap', () => {
	it('returns null for a tier with no emoji, and for tiers outside the ladder', () => {
		const map = createMeritBadgeEmojiMap(new Map([[2, dummyEmojiId(2)]]));

		expect(map.byTier(1)).toBeNull();
		expect(map.byTier(2)).toBe(`<:ferrum_ii:${dummyEmojiId(2)}>`);
		expect(map.byTier(0)).toBeNull();
		expect(map.byTier(37)).toBeNull();
	});
});
