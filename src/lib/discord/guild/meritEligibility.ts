import type { Guild } from 'discord.js';

import { listCachedDivisions } from './divisions';
import type { ResolveMeritEligibility } from '../../services/merit-eligibility/meritEligibility';

const MERIT_ELIGIBLE_DIVISION_CODES = ['LGN', 'INT', 'RES'];

export function createMeritEligibilityResolver(guild: Guild): ResolveMeritEligibility {
	return async (discordUserId) => {
		try {
			const divisions = await listCachedDivisions({ codes: MERIT_ELIGIBLE_DIVISION_CODES });
			const configuredRoleIds = divisions.map((division) => division.discordRoleId).filter((roleId): roleId is string => Boolean(roleId));
			if (configuredRoleIds.length === 0) return 'unavailable';
			const member = await guild.members.fetch({ user: discordUserId, force: true });
			if (member.user.bot) return 'not_org_member';
			if (configuredRoleIds.some((roleId) => member.roles.cache.has(roleId))) return 'eligible';
			// Missing configuration cannot disprove a match, but must not veto a confirmed one.
			return MERIT_ELIGIBLE_DIVISION_CODES.every((code) => divisions.some((division) => division.code === code && division.discordRoleId))
				? 'not_org_member'
				: 'unavailable';
		} catch (error) {
			// Discord's Unknown Member is conclusive; transport/permission failures are not.
			return typeof error === 'object' && error !== null && 'code' in error && error.code === 10007 ? 'not_org_member' : 'unavailable';
		}
	};
}
