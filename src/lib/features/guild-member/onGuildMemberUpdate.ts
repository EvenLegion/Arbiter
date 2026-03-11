import type { GuildMember, PartialGuildMember } from 'discord.js';
import type { Division } from '@prisma/client';

import { container } from '@sapphire/framework';
import { reconcileRolesAndMemberships } from './reconcileRolesAndMemberships';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';

type HandleGuildMemberUpdateParams = {
	oldMember: GuildMember | PartialGuildMember;
	newMember: GuildMember;
	context: ExecutionContext;
};

type HaveDiscordRolesChangedParams = Pick<HandleGuildMemberUpdateParams, 'oldMember' | 'newMember'>;

export async function handleGuildMemberUpdate({ oldMember, newMember, context }: HandleGuildMemberUpdateParams) {
	const caller = 'handleGuildMemberUpdate';
	const logger = context.logger.child({ caller });
	if (oldMember.partial) {
		logger.trace(
			{
				discordUserId: newMember.user.id,
				discordUsername: newMember.user.username
			},
			'Skipping guild member update because old member payload is partial'
		);
		return;
	}

	const { haveRolesChanged, oldRoleIds, newRoleIds } = haveDiscordRolesChanged({ oldMember, newMember });
	const addedRoleIds = newRoleIds.filter((newRoleId) => !oldRoleIds.includes(newRoleId));
	const removedRoleIds = oldRoleIds.filter((oldRoleId) => !newRoleIds.includes(oldRoleId));

	if (!haveRolesChanged) {
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
	const divisions = await container.utilities.divisionCache.get({});

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

	let discordUser: GuildMember;
	try {
		discordUser = await container.utilities.member.getOrThrow({
			guild: newMember.guild,
			discordUserId: newMember.user.id
		});
	} catch {
		logger.error(
			{
				discordUserId: newMember.user.id
			},
			'Discord user not found in guild members'
		);
		return;
	}

	await reconcileRolesAndMemberships({
		discordUser,
		context: createChildExecutionContext({
			context,
			bindings: {
				step: 'reconcileRolesAndMemberships'
			}
		})
	});

	const nicknameSyncResult = await container.utilities.member
		.syncComputedNickname({
			member: discordUser,
			context,
			setReason: 'Guild member update nickname sync',
			contextBindings: {
				step: 'buildUserNickname'
			}
		})
		.catch((err: unknown) => {
			logger.error(
				{
					discordUserId: discordUser.id,
					discordUsername: discordUser.user.username,
					discordNickname: discordUser.nickname,
					err
				},
				"Failed to sync user's discord nickname"
			);
			return null;
		});
	if (!nicknameSyncResult) {
		return;
	}

	if (nicknameSyncResult.outcome === 'skipped') {
		logger.warn(
			{
				discordUsername: discordUser.user.username,
				discordNickname: discordUser.nickname ?? discordUser.user.globalName ?? discordUser.user.username,
				reason: nicknameSyncResult.reason
			},
			'Skipping nickname update'
		);
		return;
	}

	if (nicknameSyncResult.outcome === 'updated') {
		logger.info(
			{
				discordUserId: discordUser.id,
				discordUsername: discordUser.user.username,
				discordNickname: discordUser.nickname,
				newUserNickname: nicknameSyncResult.computedNickname
			},
			"Updating user's discord nickname"
		);
	}
}

function haveDiscordRolesChanged({ oldMember, newMember }: HaveDiscordRolesChangedParams) {
	const oldRoleIds = oldMember.roles.cache.map((role) => role.id);
	const newRoleIds = newMember.roles.cache.map((role) => role.id);

	return {
		haveRolesChanged: oldRoleIds.some((roleId) => !newRoleIds.includes(roleId)) || newRoleIds.some((roleId) => !oldRoleIds.includes(roleId)),
		oldRoleIds,
		newRoleIds
	};
}

function getDivisionNameByDiscordRoleId({ divisions, discordRoleId }: { divisions: Division[]; discordRoleId: string }) {
	return divisions.find((division) => division.discordRoleId === discordRoleId)?.name;
}
