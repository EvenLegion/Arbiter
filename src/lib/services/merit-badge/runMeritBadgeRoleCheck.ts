import { DivisionKind } from '@prisma/client';
import type { Guild } from 'discord.js';

import { ENV_MERIT_BADGE_ROLES } from '../../../config/env/discord';
import type { MeritBadgeRoleMap } from '../../../config/meritBadgeRoles';
import { getCachedDivisionsByKind } from '../../../integrations/prisma';
import { getConfiguredGuild } from '../../discord/guild/configuredGuild';
import type { ContextLogger } from '../../logging/executionContext';
import { checkMeritBadgeRoles, type MeritBadgeRoleIssue } from './meritBadgeRoleCheck';

export type MeritBadgeRoleCheckResult =
	{ status: 'disabled' } | { status: 'checked'; configuredTierCount: number; issues: MeritBadgeRoleIssue[] } | { status: 'failed' };

/**
 * Reads the configured guild's roles and reports badge role problems as warnings.
 * Runs once the guild is ready and again from the sync command's dry run (MB-06).
 * Never edits a role and never throws.
 */
export async function runMeritBadgeRoleCheck({
	guild,
	logger,
	roleMap = ENV_MERIT_BADGE_ROLES,
	loadStaffRoleIds = loadStaffDivisionRoleIds
}: {
	guild: Guild;
	logger: ContextLogger;
	roleMap?: MeritBadgeRoleMap;
	loadStaffRoleIds?: () => Promise<ReadonlySet<string>>;
}): Promise<MeritBadgeRoleCheckResult> {
	if (!roleMap.isEnabled) {
		return { status: 'disabled' };
	}

	try {
		const [roles, botMember, staffRoleIds] = await Promise.all([guild.roles.fetch(), guild.members.fetchMe(), loadStaffRoleIds()]);
		const issues = checkMeritBadgeRoles({
			roleMap,
			guildRoles: [...roles.values()].map((role) => ({
				id: role.id,
				name: role.name,
				position: role.position,
				permissions: role.permissions.bitfield,
				hasIcon: Boolean(role.icon || role.unicodeEmoji)
			})),
			everyoneRoleId: guild.roles.everyone.id,
			botHighestRoleId: botMember.roles.highest.id,
			staffRoleIds
		});

		for (const issue of issues) {
			logger.warn({ guildId: guild.id, ...issue }, 'merit_badge.role_check.issue');
		}
		logger.info(
			{ guildId: guild.id, configuredTierCount: roleMap.configuredRoles.length, issueCount: issues.length },
			'merit_badge.role_check.completed'
		);

		return { status: 'checked', configuredTierCount: roleMap.configuredRoles.length, issues };
	} catch (error) {
		logger.warn({ err: error, guildId: guild.id }, 'merit_badge.role_check.failed');
		return { status: 'failed' };
	}
}

/** Startup entry point: does nothing while no badge role is configured, and never throws. */
export async function runMeritBadgeRoleStartupCheck({ logger }: { logger: ContextLogger }): Promise<MeritBadgeRoleCheckResult> {
	if (!ENV_MERIT_BADGE_ROLES.isEnabled) {
		return { status: 'disabled' };
	}

	let guild: Guild;
	try {
		guild = await getConfiguredGuild();
	} catch (error) {
		logger.warn({ err: error }, 'merit_badge.role_check.failed');
		return { status: 'failed' };
	}

	return runMeritBadgeRoleCheck({ guild, logger });
}

async function loadStaffDivisionRoleIds(): Promise<ReadonlySet<string>> {
	const staffDivisions = await getCachedDivisionsByKind(DivisionKind.STAFF);
	return new Set(staffDivisions.flatMap((division) => (division.discordRoleId ? [division.discordRoleId] : [])));
}
