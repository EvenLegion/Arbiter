import { Prisma } from '@prisma/client';

import { prisma } from './prisma';
import { container } from '@sapphire/framework';

type DeleteManyDivisionMembershipParams = {
    userId?: string;
    discordUserId?: string;
    divisionIds: number[];
};

export async function deleteManyDivisionMembership({
    userId,
    discordUserId,
    divisionIds,
}: DeleteManyDivisionMembershipParams) {
    const caller = 'deleteManyDivisionMembership';

    if (!userId && !discordUserId) {
        container.logger.error({ caller }, 'Either userId or discordUserId must be provided');
        throw new Error('Either userId or discordUserId must be provided');
    }

    if (divisionIds.length === 0) {
        container.logger.error({ caller }, 'divisionIds must not be empty');
        throw new Error('divisionIds must not be empty');
    }

    if (userId) {
        container.logger.trace(
            { caller, userId, divisionIds },
            'deleteManyDivisionMembership parameters',
        );

        return prisma.divisionMembership.deleteMany({
            where: {
                userId,
                divisionId: { in: divisionIds },
            },
        });
    }

    container.logger.trace(
        { caller, discordUserId, divisionIds },
        'deleteManyDivisionMembership using raw SQL parameters because userId is not provided',
    );

    // We need to know the userDbId to delete the division memberships, but all we have is the discordUserId
    // so we need to use a raw SQL query to delete the division memberships using a CROSS JOIN to get the userDbId
    // and then UNNEST the divisionIds to delete the division memberships
    const deletedCount = await prisma.$executeRaw`
        DELETE FROM "DivisionMembership" AS "dm"
        USING "User" AS "u"
        WHERE "dm"."userId" = "u"."id"
          AND "u"."discordUserId" = ${discordUserId}
          AND "dm"."divisionId" = ANY(ARRAY[${Prisma.join(divisionIds)}]::INTEGER[])
    `;

    if (deletedCount === 0) {
        container.logger.trace(
            { caller, discordUserId, divisionIds },
            'No memberships matched delete criteria',
        );
    }

    return { count: deletedCount };
}
