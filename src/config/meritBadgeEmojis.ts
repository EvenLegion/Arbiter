import { MERIT_BADGE_TIERS, type MeritBadgeTier } from '@arbiter/domain';

/**
 * Merit badge emoji configuration.
 *
 * Each badge tier can have one custom Discord emoji, set through one optional environment variable per
 * tier, for example `MERIT_BADGE_ADAMAS_I_EMOJI_ID`. An unset or empty variable means that tier has no
 * emoji, and member copy shows the badge name alone. The emoji must live in a server Arbiter is in.
 * Arbiter never uploads, edits or deletes emojis. Emojis are assumed to be static (not animated).
 */

const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const MERIT_BADGE_EMOJI_ENV_PATTERN = /^MERIT_BADGE_\w+_EMOJI_ID$/;

export function getMeritBadgeEmojiEnvName(tier: Pick<MeritBadgeTier, 'levelName' | 'section'>) {
	return `MERIT_BADGE_${tier.levelName.toUpperCase().replace(/\s+/g, '_')}_${tier.section}_EMOJI_ID`;
}

/** The name a tier's image is uploaded under, for example `supra_omnia_iii`. */
export function getMeritBadgeEmojiName(tier: Pick<MeritBadgeTier, 'label'>) {
	return tier.label.toLowerCase().replace(/\s+/g, '_');
}

/** The 36 variable names in ladder order, generated from the badge policy so they cannot drift. */
export const MERIT_BADGE_EMOJI_ENV_NAMES: readonly string[] = Object.freeze(MERIT_BADGE_TIERS.map((tier) => getMeritBadgeEmojiEnvName(tier)));

const KNOWN_ENV_NAMES = new Set(MERIT_BADGE_EMOJI_ENV_NAMES);

export type ParsedMeritBadgeEmojiIds = {
	emojiIdsByTier: ReadonlyMap<number, string>;
	issues: string[];
};

/**
 * Reads the badge emoji IDs from an environment source.
 *
 * Reports, without throwing: a value that is not a Discord ID, an ID shared by two tiers, and a set
 * `MERIT_BADGE_*_EMOJI_ID` variable that names no tier.
 */
export function parseMeritBadgeEmojiIds(source: Readonly<Record<string, string | undefined>>): ParsedMeritBadgeEmojiIds {
	const issues: string[] = [];
	const emojiIdsByTier = new Map<number, string>();
	const envNameByEmojiId = new Map<string, string>();

	for (const [envName, rawValue] of Object.entries(source)) {
		if (MERIT_BADGE_EMOJI_ENV_PATTERN.test(envName) && !KNOWN_ENV_NAMES.has(envName) && (rawValue ?? '').trim().length > 0) {
			issues.push(
				`${envName}: unknown merit badge tier (expected one of ${MERIT_BADGE_EMOJI_ENV_NAMES[0]} … ${MERIT_BADGE_EMOJI_ENV_NAMES.at(-1)})`
			);
		}
	}

	for (const tier of MERIT_BADGE_TIERS) {
		const envName = getMeritBadgeEmojiEnvName(tier);
		const emojiId = (source[envName] ?? '').trim();
		if (emojiId.length === 0) {
			continue;
		}

		if (!DISCORD_SNOWFLAKE_PATTERN.test(emojiId)) {
			issues.push(`${envName}: must be a Discord emoji ID (17 to 20 digits)`);
			continue;
		}

		const duplicateEnvName = envNameByEmojiId.get(emojiId);
		if (duplicateEnvName) {
			issues.push(`${envName}: uses the same emoji ID as ${duplicateEnvName}; each badge tier needs its own emoji`);
			continue;
		}

		envNameByEmojiId.set(emojiId, envName);
		emojiIdsByTier.set(tier.tier, emojiId);
	}

	return { emojiIdsByTier, issues };
}

export type MeritBadgeEmojiMap = Readonly<{
	/** The emoji mention for a tier, for example `<:ferrum_i:123…>`, or null when the tier has none. */
	byTier: (tier: number) => string | null;
}>;

export function createMeritBadgeEmojiMap(emojiIdsByTier: ReadonlyMap<number, string>): MeritBadgeEmojiMap {
	const mentionByTier = new Map<number, string>();
	for (const tier of MERIT_BADGE_TIERS) {
		const emojiId = emojiIdsByTier.get(tier.tier);
		if (emojiId) {
			mentionByTier.set(tier.tier, `<:${getMeritBadgeEmojiName(tier)}:${emojiId}>`);
		}
	}

	return Object.freeze({
		byTier: (tier: number) => mentionByTier.get(tier) ?? null
	});
}
