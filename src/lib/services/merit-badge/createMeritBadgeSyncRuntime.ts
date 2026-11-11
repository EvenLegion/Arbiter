import type { Guild, GuildMember } from 'discord.js';

import { ENV_DISCORD, ENV_MERIT_BADGE_ROLES } from '../../../config/env/discord';
import type { MeritBadgeRoleMap } from '../../../config/meritBadgeRoles';
import { meritRepository } from '../../../integrations/prisma/repositories';
import { getDbUser } from '../../discord/guild/users';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { MERIT_BADGE_MEMBER_LOCK, type RunExclusive } from './meritBadgeMemberLock';
import { MERIT_BADGE_RECENT_ROLE_CHANGES, type RecentRoleChanges } from './meritBadgeRecentRoleChanges';
import { createMeritBadgeRoleGateway, toMeritBadgeRoleFailure } from './meritBadgeRoleGateway';
import { syncMemberMeritBadge, type MeritBadgeSyncDeps, type MeritBadgeSyncInput, type MeritBadgeSyncResult } from './meritBadgeSyncService';

export type MeritBadgeSyncRuntime = {
	syncMember: (input: MeritBadgeSyncInput) => Promise<MeritBadgeSyncResult>;
};

/**
 * Wires the badge sync service to Discord and Postgres for one guild.
 *
 * The guild must be the configured guild. For any other guild every sync returns
 * `failed` with code `wrong_guild` and makes no reads or Discord calls.
 * Every caller shares one per-member lock and one record of recent role changes unless a test
 * passes its own.
 */
export function createMeritBadgeSyncRuntime({
	guild,
	context,
	auditReason,
	roleMap = ENV_MERIT_BADGE_ROLES,
	configuredGuildId = ENV_DISCORD.DISCORD_GUILD_ID,
	runExclusive = MERIT_BADGE_MEMBER_LOCK,
	recentRoleChanges = MERIT_BADGE_RECENT_ROLE_CHANGES,
	resolveMember,
	readTotalMerits = readMemberTotalMerits
}: {
	guild: Guild;
	context: ExecutionContext;
	/** Shown in the Discord audit log for each role change. */
	auditReason?: string;
	roleMap?: MeritBadgeRoleMap;
	configuredGuildId?: string;
	runExclusive?: RunExclusive;
	recentRoleChanges?: RecentRoleChanges;
	resolveMember?: (discordUserId: string) => Promise<GuildMember | null>;
	readTotalMerits?: (discordUserId: string) => Promise<number>;
}): MeritBadgeSyncRuntime {
	const logger = createChildExecutionContext({ context, bindings: { flow: 'merit_badge.sync', guildId: guild.id } }).logger;

	if (guild.id !== configuredGuildId) {
		return {
			syncMember: async ({ discordUserId }) => {
				logger.error({ discordUserId, configuredGuildId }, 'merit_badge.sync.wrong_guild');
				return { kind: 'failed', discordUserId, stage: 'guild', code: 'wrong_guild', addedRoleId: null, removedRoleIds: [] };
			}
		};
	}

	const gateway = createMeritBadgeRoleGateway({ auditReason });
	const deps: MeritBadgeSyncDeps<GuildMember> = {
		roleMap,
		runExclusive,
		logger,
		getMember: resolveMember ?? ((discordUserId) => fetchGuildMember(guild, discordUserId)),
		describeMember: (member) => ({
			isBot: member.user.bot,
			// The cache lags our own role changes until Discord's member update arrives.
			roleIds: recentRoleChanges.apply(member.id, member.roles.cache.keys())
		}),
		readTotalMerits,
		addRole: async (member, roleId) => {
			const result = await gateway.addRole(member, roleId);
			if (result.ok) {
				recentRoleChanges.record(member.id, roleId, true);
			}
			return result;
		},
		removeRole: async (member, roleId) => {
			const result = await gateway.removeRole(member, roleId);
			if (result.ok) {
				recentRoleChanges.record(member.id, roleId, false);
			}
			return result;
		}
	};

	return {
		syncMember: (input) => syncMemberMeritBadge(deps, input)
	};
}

async function readMemberTotalMerits(discordUserId: string): Promise<number> {
	const dbUser = await getDbUser({ discordUserId });
	if (!dbUser) {
		return 0;
	}

	return meritRepository.getUserTotalMerits({ userDbUserId: dbUser.id });
}

/** Cached member first. Only "unknown member" (10007) means not found; any other fetch error fails the sync. */
async function fetchGuildMember(guild: Guild, discordUserId: string): Promise<GuildMember | null> {
	const cachedMember = guild.members.cache.get(discordUserId);
	if (cachedMember) {
		return cachedMember;
	}

	try {
		return await guild.members.fetch(discordUserId);
	} catch (error) {
		if (toMeritBadgeRoleFailure(error).code === 'unknown_member') {
			return null;
		}
		throw error;
	}
}
