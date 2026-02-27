import type { GuildMember, PartialGuildMember } from "discord.js";
import type { Division } from '@prisma/client';

import { container } from '@sapphire/framework';
import { reconcileRolesAndMemberships } from "./reconcileRolesAndMemberships";
import { buildUserNickname } from "./buildUserNickname";
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';

type HandleGuildMemberUpdateParams = {
    oldMember: GuildMember | PartialGuildMember;
    newMember: GuildMember;
    context: ExecutionContext;
};

type HaveDiscordRolesChangedParams = Pick<HandleGuildMemberUpdateParams, 'oldMember' | 'newMember'>;

export async function handleGuildMemberUpdate(
    { oldMember, newMember, context }: HandleGuildMemberUpdateParams,
) {
    const caller = 'handleGuildMemberUpdate';
    const logger = context.logger.child({ caller });

    const { haveRolesChanged, oldRoleIds, newRoleIds } = haveDiscordRolesChanged({ oldMember, newMember });
    const addedRoleIds = newRoleIds.filter(newRoleId => !oldRoleIds.includes(newRoleId));
    const removedRoleIds = oldRoleIds.filter(oldRoleId => !newRoleIds.includes(oldRoleId));

    const divisions = await container.utilities.divisionCache.get({});

    if (!haveRolesChanged) {
        logger.trace(
            {
                discordUserId: newMember.user.id,
                discordUsername: newMember.user.username,
                discordNickname: newMember.nickname,
            },
            'Skipping guild member update, no actionable changes detected',
        );
        return;
    }

    logger.debug(
        {
            caller,
            discordUserId: newMember.user.id,
            discordUsername: newMember.user.username,
            discordNickname: newMember.nickname,
            addedRoles: addedRoleIds.map(roleId => ({
                roleId,
                roleName: getDivisionNameByDiscordRoleId({ divisions, discordRoleId: roleId }),
            })),
            removedRoles: removedRoleIds.map(roleId => ({
                roleId,
                roleName: getDivisionNameByDiscordRoleId({ divisions, discordRoleId: roleId }),
            })),
        },
        'guildMemberUpdate detected role changes',
    );

    let discordUser: GuildMember;
    try {
        discordUser = await container.utilities.member.getOrThrow({
            guild: newMember.guild,
            discordUserId: newMember.user.id,
        });
    } catch {
        logger.error(
            {
                discordUserId: newMember.user.id,
            },
            'Discord user not found in guild members',
        );
        return;
    }

    await reconcileRolesAndMemberships({
        discordUser,
        context: createChildExecutionContext({
            context,
            bindings: {
                step: 'reconcileRolesAndMemberships',
            },
        }),
    });

    const { newUserNickname, reason } = await buildUserNickname({
        discordUser,
        context: createChildExecutionContext({
            context,
            bindings: {
                step: 'buildUserNickname',
            },
        }),
    });

    if (newUserNickname === null) {
        logger.warn({
            discordUsername: discordUser.user.username,
            discordNickname: discordUser.nickname ?? discordUser.user.globalName ?? discordUser.user.username,
            reason,
        }, 'Skipping nickname update');
        return;
    }

    try {
        logger.info({
            discordUserId: discordUser.id,
            discordUsername: discordUser.user.username,
            discordNickname: discordUser.nickname,
            newUserNickname,
        }, "Updating user's discord nickname");
        await discordUser.setNickname(newUserNickname);
    } catch (err) {
        logger.error({
            discordUserId: discordUser.id,
            discordUsername: discordUser.user.username,
            discordNickname: discordUser.nickname,
            newUserNickname,
            err,
        }, "Failed to update user's discord nickname");
        return;
    }
}

function haveDiscordRolesChanged(
    { oldMember, newMember }: HaveDiscordRolesChangedParams,
) {
    const oldRoleIds = oldMember.roles.cache.map(role => role.id);
    const newRoleIds = newMember.roles.cache.map(role => role.id);

    return {
        haveRolesChanged: oldRoleIds.some(
            roleId => !newRoleIds.includes(roleId)) ||
            newRoleIds.some(roleId => !oldRoleIds.includes(roleId)),
        oldRoleIds,
        newRoleIds,
    };
}

function getDivisionNameByDiscordRoleId({
    divisions,
    discordRoleId,
}: {
    divisions: Division[];
    discordRoleId: string;
}) {
    return divisions.find((division) => division.discordRoleId === discordRoleId)?.name;
}
