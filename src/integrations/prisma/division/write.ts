import { Prisma } from '@prisma/client';
import { container } from '@sapphire/framework';

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
		container.logger.trace({ caller, userId, divisionIds }, 'createManyDivisionMembership parameters');

		return prisma.divisionMembership.createMany({
			data: divisionIds.map((divisionId) => ({
				userId,
				divisionId
			})),
			skipDuplicates: true
		});
	}

	container.logger.trace(
		{ caller, discordUserId, divisionIds },
		'createManyDivisionMembership using raw SQL parameters because userId is not provided'
	);

	const insertedCount = await prisma.$executeRaw`
        INSERT INTO "DivisionMembership" ("userId", "divisionId", "createdAt", "updatedAt")
        SELECT "User"."id", "divisionIds"."divisionId", NOW(), NOW()
        FROM "User"
        CROSS JOIN UNNEST(ARRAY[${Prisma.join(divisionIds)}]::INTEGER[]) AS "divisionIds"("divisionId")
        WHERE "User"."discordUserId" = ${discordUserId}
        ON CONFLICT ("userId", "divisionId") DO NOTHING
    `;

	if (insertedCount === 0) {
		container.logger.trace({ caller, discordUserId, divisionIds }, 'No memberships inserted (already exists or user not found)');
	}

	return { count: insertedCount };
}

export async function deleteManyDivisionMembership({ userId, discordUserId, divisionIds }: DeleteManyDivisionMembershipParams) {
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
		container.logger.trace({ caller, userId, divisionIds }, 'deleteManyDivisionMembership parameters');

		return prisma.divisionMembership.deleteMany({
			where: {
				userId,
				divisionId: { in: divisionIds }
			}
		});
	}

	container.logger.trace(
		{ caller, discordUserId, divisionIds },
		'deleteManyDivisionMembership using raw SQL parameters because userId is not provided'
	);

	const deletedCount = await prisma.$executeRaw`
        DELETE FROM "DivisionMembership" AS "dm"
        USING "User" AS "u"
        WHERE "dm"."userId" = "u"."id"
          AND "u"."discordUserId" = ${discordUserId}
          AND "dm"."divisionId" = ANY(ARRAY[${Prisma.join(divisionIds)}]::INTEGER[])
    `;

	if (deletedCount === 0) {
		container.logger.trace({ caller, discordUserId, divisionIds }, 'No memberships matched delete criteria');
	}

	return { count: deletedCount };
}
