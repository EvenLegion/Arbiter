import { MERIT_BADGE_TIERS, getMeritBadgeTier, type MeritBadgeTier } from '@arbiter/domain';

/**
 * Merit badge role configuration.
 *
 * The admin creates one Discord role per badge tier and gives Arbiter its ID through one optional
 * environment variable per tier, for example `MERIT_BADGE_ADAMAS_I_ROLE_ID`. An unset or empty
 * variable means that tier is not configured. With no tier configured, badge sync is off.
 * Arbiter never creates, edits, reorders or deletes these roles.
 */

const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const MERIT_BADGE_ROLE_ENV_PATTERN = /^MERIT_BADGE_\w+_ROLE_ID$/;

export function getMeritBadgeRoleEnvName(tier: Pick<MeritBadgeTier, 'levelName' | 'section'>) {
	return `MERIT_BADGE_${tier.levelName.toUpperCase().replace(/\s+/g, '_')}_${tier.section}_ROLE_ID`;
}

/** The 36 variable names in ladder order, generated from the badge policy so they cannot drift. */
export const MERIT_BADGE_ROLE_ENV_NAMES: readonly string[] = Object.freeze(MERIT_BADGE_TIERS.map((tier) => getMeritBadgeRoleEnvName(tier)));

const TIER_BY_ENV_NAME = new Map(MERIT_BADGE_TIERS.map((tier) => [getMeritBadgeRoleEnvName(tier), tier] as const));

export type ParsedMeritBadgeRoleIds = {
	roleIdsByTier: ReadonlyMap<number, string>;
	issues: string[];
};

/**
 * Reads the badge role IDs from an environment source.
 *
 * Reports, without throwing: a value that is not a Discord ID, an ID shared by two tiers, an ID
 * that reuses another `*_ROLE_ID` variable in the same source (for example a division role), and a
 * set `MERIT_BADGE_*_ROLE_ID` variable that names no tier.
 */
export function parseMeritBadgeRoleIds(source: Readonly<Record<string, string | undefined>>): ParsedMeritBadgeRoleIds {
	const issues: string[] = [];
	const roleIdsByTier = new Map<number, string>();
	const envNameByRoleId = new Map<string, string>();
	const otherEnvNameByRoleId = new Map<string, string>();

	for (const [envName, rawValue] of Object.entries(source)) {
		const value = (rawValue ?? '').trim();
		if (!MERIT_BADGE_ROLE_ENV_PATTERN.test(envName)) {
			if (envName.endsWith('_ROLE_ID') && value.length > 0 && !otherEnvNameByRoleId.has(value)) {
				otherEnvNameByRoleId.set(value, envName);
			}
			continue;
		}
		if (TIER_BY_ENV_NAME.has(envName)) {
			continue;
		}
		if (value.length > 0) {
			issues.push(
				`${envName}: unknown merit badge tier (expected one of ${MERIT_BADGE_ROLE_ENV_NAMES[0]} … ${MERIT_BADGE_ROLE_ENV_NAMES.at(-1)})`
			);
		}
	}

	for (const tier of MERIT_BADGE_TIERS) {
		const envName = getMeritBadgeRoleEnvName(tier);
		const roleId = (source[envName] ?? '').trim();
		if (roleId.length === 0) {
			continue;
		}

		if (!DISCORD_SNOWFLAKE_PATTERN.test(roleId)) {
			issues.push(`${envName}: must be a Discord role ID (17 to 20 digits)`);
			continue;
		}

		const duplicateEnvName = envNameByRoleId.get(roleId);
		if (duplicateEnvName) {
			issues.push(`${envName}: uses the same role ID as ${duplicateEnvName}; each badge tier needs its own role`);
			continue;
		}

		const otherEnvName = otherEnvNameByRoleId.get(roleId);
		if (otherEnvName) {
			issues.push(`${envName}: uses the same role ID as ${otherEnvName}; badge roles must be separate roles`);
			continue;
		}

		envNameByRoleId.set(roleId, envName);
		roleIdsByTier.set(tier.tier, roleId);
	}

	return { roleIdsByTier, issues };
}

export type ConfiguredMeritBadgeRole = Readonly<{
	tier: MeritBadgeTier;
	roleId: string;
}>;

export type MeritBadgeRoleMap = Readonly<{
	/** True when at least one tier has a role ID. False means badge sync is off. */
	isEnabled: boolean;
	/** Every configured badge role ID. */
	roleIds: ReadonlySet<string>;
	/** Configured tiers in ladder order. */
	configuredRoles: readonly ConfiguredMeritBadgeRole[];
	byTier: (tier: number) => string | null;
	byRoleId: (roleId: string) => MeritBadgeTier | null;
	/**
	 * The highest configured tier at or below `tier`, or null when none is configured.
	 * This is the fallback for a target tier whose role does not exist yet.
	 */
	resolveConfiguredRoleAtOrBelow: (tier: number) => ConfiguredMeritBadgeRole | null;
}>;

export function createMeritBadgeRoleMap(roleIdsByTier: ReadonlyMap<number, string>): MeritBadgeRoleMap {
	const configuredRoles = MERIT_BADGE_TIERS.flatMap((tier) => {
		const roleId = roleIdsByTier.get(tier.tier);
		return roleId ? [Object.freeze({ tier, roleId })] : [];
	});
	const roleIdByTier = new Map(configuredRoles.map((role) => [role.tier.tier, role.roleId] as const));
	const tierByRoleId = new Map(configuredRoles.map((role) => [role.roleId, role.tier] as const));

	return Object.freeze({
		isEnabled: configuredRoles.length > 0,
		roleIds: new Set(tierByRoleId.keys()),
		configuredRoles: Object.freeze(configuredRoles),
		byTier: (tier: number) => roleIdByTier.get(tier) ?? null,
		byRoleId: (roleId: string) => tierByRoleId.get(roleId) ?? null,
		resolveConfiguredRoleAtOrBelow: (tier: number) => {
			const ceiling = getMeritBadgeTier(Math.min(Math.floor(tier), MERIT_BADGE_TIERS.length));
			if (!ceiling) {
				return null;
			}

			for (let index = configuredRoles.length - 1; index >= 0; index--) {
				if (configuredRoles[index].tier.tier <= ceiling.tier) {
					return configuredRoles[index];
				}
			}

			return null;
		}
	});
}
