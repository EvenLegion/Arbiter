import { PermissionFlagsBits, RESTEvents, type Guild, type GuildMember, type RateLimitData } from 'discord.js';

import { ENV_MERIT_BADGE_ROLES } from '../../../../config/env/discord';
import type { MeritBadgeRoleMap } from '../../../../config/meritBadgeRoles';
import { meritRepository, userRepository } from '../../../../integrations/prisma/repositories';
import { getGuildMember, listGuildMembers } from '../../../discord/guild/guildMembers';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createChildExecutionContext } from '../../../logging/executionContext';
import { createMeritBadgeSyncRuntime } from '../../../services/merit-badge/createMeritBadgeSyncRuntime';
import type { MeritBadgeBulkMember, MeritBadgeBulkSyncDeps, MeritBadgeStoredTotal } from '../../../services/merit-badge/meritBadgeBulkSyncService';

export const STAFF_MERIT_BADGE_SYNC_AUDIT_REASON = 'Staff merit badge sync';

/** Wires the bulk badge service to the configured guild, Postgres and the discord.js REST queue. */
export function createStaffMeritBadgeSyncDeps({
	guild,
	context,
	roleMap = ENV_MERIT_BADGE_ROLES
}: {
	guild: Guild;
	context: ExecutionContext;
	roleMap?: MeritBadgeRoleMap;
}): MeritBadgeBulkSyncDeps & { loadBotRoleAccess: () => Promise<{ botHasManageRoles: boolean; editableRoleIds: Set<string> }> } {
	const logger = createChildExecutionContext({ context, bindings: { flow: 'merit_badge.bulk_sync', guildId: guild.id } }).logger;
	const runtime = createMeritBadgeSyncRuntime({ guild, context, auditReason: STAFF_MERIT_BADGE_SYNC_AUDIT_REASON, roleMap });

	return {
		roleMap,
		logger,
		listMembers: async ({ requestedDiscordUserId }) => {
			if (requestedDiscordUserId) {
				const member = await getGuildMember({ guild, discordUserId: requestedDiscordUserId, logger });
				return member ? [toBulkMember(member)] : [];
			}

			const members = await listGuildMembers({ guild });
			return [...members.values()].map(toBulkMember);
		},
		readTotals: readStoredTotals,
		syncMember: (discordUserId) => runtime.syncMember({ discordUserId }),
		watchRateLimits: (onWait) => {
			const listener = (info: RateLimitData) => onWait(info.timeToReset);
			guild.client.rest.on(RESTEvents.RateLimited, listener);
			return () => {
				guild.client.rest.off(RESTEvents.RateLimited, listener);
			};
		},
		loadBotRoleAccess: async () => {
			const [roles, botMember] = await Promise.all([guild.roles.fetch(), guild.members.fetchMe()]);
			return {
				botHasManageRoles: botMember.permissions.has(PermissionFlagsBits.ManageRoles),
				// `editable`: not managed by an integration, and below Arbiter's highest role.
				editableRoleIds: new Set([...roles.values()].filter((role) => role.editable).map((role) => role.id))
			};
		}
	};
}

function toBulkMember(member: GuildMember): MeritBadgeBulkMember {
	return {
		discordUserId: member.id,
		isBot: member.user.bot,
		roleIds: [...member.roles.cache.keys()]
	};
}

/** Throws when either read fails, so the caller never mistakes a failed read for 0 merits. */
async function readStoredTotals(discordUserIds: readonly string[]): Promise<Map<string, MeritBadgeStoredTotal>> {
	const users = await userRepository.list({ discordUserIds: [...discordUserIds] });
	const totalsByDbUserId = await meritRepository.getUsersTotalMerits({ userDbUserIds: users.map((user) => user.id) });

	return new Map(
		users.map((user) => [user.discordUserId, { totalMerits: totalsByDbUserId.get(user.id) ?? 0, storedUsername: user.discordUsername }] as const)
	);
}
