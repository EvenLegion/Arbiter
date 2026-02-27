import { container } from '@sapphire/framework';
import { prisma } from './prisma';

type FindManyUsersDivisionsParams = {
	userId?: string;
	discordUserId?: string;
};

export async function findManyUsersDivisions({ userId, discordUserId }: FindManyUsersDivisionsParams) {
	const caller = 'findManyUsersDivisions';

	if (!userId && !discordUserId) {
		container.logger.error({ caller }, 'Either userId or discordUserId must be provided');
		throw new Error('Either userId or discordUserId must be provided');
	}

	return prisma.division.findMany({
		where: {
			divisionMemberships: {
				some: {
					...(userId ? { userId } : {}),
					...(discordUserId ? { user: { discordUserId } } : {})
				}
			}
		},
		orderBy: { id: 'asc' }
	});
}
