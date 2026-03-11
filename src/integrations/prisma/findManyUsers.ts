import { prisma } from './prisma';

type FindManyUsersParams = {
	dbUserIds?: string[];
	discordUserIds?: string[];
};

export async function findManyUsers({ dbUserIds, discordUserIds }: FindManyUsersParams = {}) {
	const uniqueDbUserIds = dbUserIds ? [...new Set(dbUserIds)] : undefined;
	const uniqueDiscordUserIds = discordUserIds ? [...new Set(discordUserIds)] : undefined;

	return prisma.user.findMany({
		where: {
			...(uniqueDbUserIds && uniqueDbUserIds.length > 0 ? { id: { in: uniqueDbUserIds } } : {}),
			...(uniqueDiscordUserIds && uniqueDiscordUserIds.length > 0 ? { discordUserId: { in: uniqueDiscordUserIds } } : {})
		},
		orderBy: {
			id: 'asc'
		}
	});
}
