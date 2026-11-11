import type { GuildMember, PartialGuildMember } from 'discord.js';
import type { Division } from '@prisma/client';

import { ENV_DISCORD } from '../../../../config/env/discord';
import { listCachedDivisions } from '../../../discord/guild/divisions';
import type { ExecutionContext } from '../../../logging/executionContext';
import { processGuildMemberRoleChange } from '../../../services/guild-member-change/guildMemberChangeService';
import { createGuildMemberChangeDeps } from '../membership/createGuildMemberChangeDeps';

type HandleGuildMemberUpdateParams = {
	oldMember: GuildMember | PartialGuildMember;
	newMember: GuildMember;
	context: ExecutionContext;
};

export async function handleGuildMemberUpdate({ oldMember, newMember, context }: HandleGuildMemberUpdateParams) {
	const caller = 'handleGuildMemberUpdate';
	const logger = context.logger.child({ caller });
	if (newMember.guild.id !== ENV_DISCORD.DISCORD_GUILD_ID) {
		logger.trace(
			{
				discordUserId: newMember.user.id,
				guildId: newMember.guild.id
			},
			'Ignoring guild member update outside the configured guild'
		);
		return;
	}

	const oldMemberIsPartial = oldMember.partial;

	const oldRoleIds = oldMemberIsPartial ? [] : oldMember.roles.cache.map((role) => role.id);
	const newRoleIds = newMember.roles.cache.map((role) => role.id);
	const addedRoleIds = newRoleIds.filter((newRoleId) => !oldRoleIds.includes(newRoleId));
	const removedRoleIds = oldRoleIds.filter((oldRoleId) => !newRoleIds.includes(oldRoleId));

	if (oldMemberIsPartial) {
		logger.trace(
			{
				discordUserId: newMember.user.id,
				discordUsername: newMember.user.username,
				discordNickname: newMember.nickname
			},
			'Old guildMemberUpdate payload is partial; reconciling from current Discord roles'
		);
	} else {
		const divisions = await listCachedDivisions({});

		logger.debug(
			{
				caller,
				discordUserId: newMember.user.id,
				discordUsername: newMember.user.username,
				discordNickname: newMember.nickname,
				addedRoles: addedRoleIds.map((roleId) => ({
					roleId,
					roleName: getDivisionNameByDiscordRoleId({ divisions, discordRoleId: roleId })
				})),
				removedRoles: removedRoleIds.map((roleId) => ({
					roleId,
					roleName: getDivisionNameByDiscordRoleId({ divisions, discordRoleId: roleId })
				}))
			},
			'guildMemberUpdate detected role changes'
		);
	}

	const result = await processGuildMemberRoleChange(
		createGuildMemberChangeDeps({
			guild: newMember.guild,
			context
		}),
		{
			discordUserId: newMember.user.id,
			oldMemberIsPartial,
			oldRoleIds,
			newRoleIds
		}
	);
	if (result.kind === 'skipped_no_role_change') {
		logger.trace(
			{
				discordUserId: newMember.user.id,
				discordUsername: newMember.user.username,
				discordNickname: newMember.nickname
			},
			'Skipping guild member update, no actionable changes detected'
		);
		return;
	}
	if (result.kind === 'badge_only') {
		const logBindings = {
			discordUserId: newMember.user.id,
			roleDiff: result.roleDiff,
			badge: result.badge
		};
		if (result.badge.kind === 'failed') {
			logger.warn(logBindings, 'Badge-only guild member update: badge sync failed');
		} else {
			logger.debug(logBindings, 'Badge-only guild member update: skipped membership and nickname sync');
		}
		return;
	}
	if (result.kind === 'member_not_found') {
		logger.error(
			{
				discordUserId: newMember.user.id,
				roleDiff: result.roleDiff
			},
			'Discord user not found in guild members'
		);
		return;
	}
	if (result.nickname.kind === 'sync_failed') {
		logger.error(
			{
				discordUserId: newMember.user.id,
				discordUsername: newMember.user.username,
				discordNickname: newMember.nickname,
				roleDiff: result.roleDiff,
				membership: result.membership,
				nickname: result.nickname,
				badge: result.badge
			},
			'Guild member update workflow failed during nickname sync'
		);
		return;
	}

	logger.info(
		{
			discordUserId: newMember.user.id,
			discordUsername: newMember.user.username,
			discordNickname: newMember.nickname,
			roleDiff: result.roleDiff,
			membership: result.membership,
			nickname: result.nickname,
			badge: result.badge
		},
		'Processed guild member update workflow'
	);
}

function getDivisionNameByDiscordRoleId({ divisions, discordRoleId }: { divisions: Division[]; discordRoleId: string }) {
	return divisions.find((division) => division.discordRoleId === discordRoleId)?.name;
}
