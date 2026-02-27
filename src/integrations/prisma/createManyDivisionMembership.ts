import { Prisma } from '@prisma/client';

import { container } from '@sapphire/framework';
import { prisma } from './prisma';

type CreateManyDivisionMembershipParams = {
    userId?: string;
    discordUserId?: string;
    divisionIds: number[];
};

export async function createManyDivisionMembership({
    userId,
    discordUserId,
    divisionIds,
}: CreateManyDivisionMembershipParams) {
    const caller = 'createManyDivisionMembership';

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
            'createManyDivisionMembership parameters',
        );

        return prisma.divisionMembership.createMany({
            data: divisionIds.map((divisionId) => ({
                userId,
                divisionId,
            })),
            skipDuplicates: true,
        });
    }

    container.logger.trace(
        { caller, discordUserId, divisionIds },
        'createManyDivisionMembership using raw SQL parameters because userId is not provided',
    );

    // We need to know the userDbId to create the division memberships, but all we have is the discordUserId
    // so we need to use a raw SQL query to create the division memberships using a CROSS JOIN to get the userDbId
    // and then UNNEST the divisionIds to create the division memberships
    const insertedCount = await prisma.$executeRaw`
        INSERT INTO "DivisionMembership" ("userId", "divisionId", "createdAt", "updatedAt")
        SELECT "User"."id", "divisionIds"."divisionId", NOW(), NOW()
        FROM "User"
        CROSS JOIN UNNEST(ARRAY[${Prisma.join(divisionIds)}]::INTEGER[]) AS "divisionIds"("divisionId")
        WHERE "User"."discordUserId" = ${discordUserId}
        ON CONFLICT ("userId", "divisionId") DO NOTHING
    `;

    if (insertedCount === 0) {
        container.logger.trace(
            { caller, discordUserId, divisionIds },
            'No memberships inserted (already exists or user not found)',
        );
    }

    return { count: insertedCount };
}
