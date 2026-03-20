import { Prisma } from '@prisma/client';

import { prisma } from '../prisma';

type CreateManyDivisionMembershipParams = {
	userId?: string;
	discordUserId?: string;
	divisionIds: number[];
};

type DeleteManyDivisionMembershipParams = {
	userId?: string;
	discordUserId?: string;
	divisionIds: number[];
};

export async function createManyDivisionMembership({ userId, discordUserId, divisionIds }: CreateManyDivisionMembershipParams) {
	if (!userId && !discordUserId) {
		throw new Error('Either userId or discordUserId must be provided');
	}

	if (divisionIds.length === 0) {
		throw new Error('divisionIds must not be empty');
	}

	if (userId) {
		return prisma.divisionMembership.createMany({
			data: divisionIds.map((divisionId) => ({
				userId,
				divisionId
			})),
			skipDuplicates: true
		});
	}

	const insertedCount = await prisma.$executeRaw`
        INSERT INTO "DivisionMembership" ("userId", "divisionId", "createdAt", "updatedAt")
        SELECT "User"."id", "divisionIds"."divisionId", NOW(), NOW()
        FROM "User"
        CROSS JOIN UNNEST(ARRAY[${Prisma.join(divisionIds)}]::INTEGER[]) AS "divisionIds"("divisionId")
        WHERE "User"."discordUserId" = ${discordUserId}
        ON CONFLICT ("userId", "divisionId") DO NOTHING
    `;

	return { count: insertedCount };
}

export async function deleteManyDivisionMembership({ userId, discordUserId, divisionIds }: DeleteManyDivisionMembershipParams) {
	if (!userId && !discordUserId) {
		throw new Error('Either userId or discordUserId must be provided');
	}

	if (divisionIds.length === 0) {
		throw new Error('divisionIds must not be empty');
	}

	if (userId) {
		return prisma.divisionMembership.deleteMany({
			where: {
				userId,
				divisionId: { in: divisionIds }
			}
		});
	}

	const deletedCount = await prisma.$executeRaw`
        DELETE FROM "DivisionMembership" AS "dm"
        USING "User" AS "u"
        WHERE "dm"."userId" = "u"."id"
          AND "u"."discordUserId" = ${discordUserId}
          AND "dm"."divisionId" = ANY(ARRAY[${Prisma.join(divisionIds)}]::INTEGER[])
    `;

	return { count: deletedCount };
}
