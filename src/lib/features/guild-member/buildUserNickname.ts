import { type Division, DivisionKind } from "@prisma/client";
import { container } from '@sapphire/framework';
import { GuildMember } from "discord.js";

import { findManyUsersDivisions } from "../../../integrations/prisma";
import type { ExecutionContext } from '../../logging/executionContext';

const PREFIX_PRIORITY: ((division: Division) => boolean)[] = [
    (division) => division.kind === DivisionKind.AUXILIARY,
    (division) => division.kind === DivisionKind.STAFF,
    (division) =>
        division.kind === DivisionKind.SPECIAL && division.code !== 'CENT',
    (division) => division.kind === DivisionKind.LANCEARIUS,
    (division) => division.kind === DivisionKind.COMBAT,
    (division) => division.kind === DivisionKind.INDUSTRIAL,
    (division) => division.kind === DivisionKind.LEGIONNAIRE,
];

type BuildUserNicknameParams = {
    discordUser: GuildMember;
    context: ExecutionContext;
};

export const buildUserNickname = async ({
    discordUser,
    context: _context,
}: BuildUserNicknameParams): Promise<{ newUserNickname: string | null; reason?: string }> => {
    const caller = 'buildUserNickname';
    const logger = _context.logger.child({ caller });

    if (discordUser.guild.ownerId === discordUser.id) {
        logger.trace('User is the guild owner, skipping nickname build');
        return { newUserNickname: null, reason: 'User is the guild owner' };
    }

    const usersDivisions = await findManyUsersDivisions({
        discordUserId: discordUser.id,
    });

    const dbUser = await container.utilities.userDirectory.getOrThrow({ discordUserId: discordUser.id });

    for (const hasPriority of PREFIX_PRIORITY) {
        const priorityDivision = usersDivisions.find(hasPriority);
        if (priorityDivision?.displayNamePrefix) {
            return { newUserNickname: `${priorityDivision.displayNamePrefix} | ${dbUser.discordNickname}` };
        }
    }

    return { newUserNickname: dbUser.discordNickname };
};
