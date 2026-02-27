import type { Prisma } from '@prisma/client';

import { prisma } from './prisma';
import { container } from '@sapphire/framework';

export type FindManyDivisionMembershipsParams = {
	userId?: string;
	discordUserId?: string;
};

export async function findManyDivisionMemberships({ userId, discordUserId }: FindManyDivisionMembershipsParams) {
	const caller = 'findManyDivisionMemberships';

	if (!userId && !discordUserId) {
		container.logger.error({ caller }, 'Either userId or discordUserId must be provided');
		throw new Error('Either userId or discordUserId must be provided');
	}

	const and: Prisma.DivisionMembershipWhereInput[] = [];

	if (userId) {
		and.push({ userId });
	}

	if (discordUserId) {
		and.push({ user: { discordUserId } });
	}

	container.logger.trace({ caller, and }, 'findManyDivisionMemberships parameters');

	return prisma.divisionMembership.findMany({
		where: and.length > 0 ? { AND: and } : undefined,
		orderBy: { id: 'asc' }
	});
}
