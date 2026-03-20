import { prisma } from '../prisma';

type FindManyUsersParams = {
	dbUserIds?: string[];
	discordUserIds?: string[];
};

type FindUniqueUserParams = {
	discordUserId?: string;
	dbUserId?: string;
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

export async function findUniqueUser({ discordUserId, dbUserId }: FindUniqueUserParams) {
	const hasDiscordUserId = typeof discordUserId === 'string';
	const hasDbUserId = typeof dbUserId === 'string';

	if (hasDbUserId) {
		return prisma.user.findUnique({
			where: { id: dbUserId! }
		});
	}

	if (hasDiscordUserId) {
		return prisma.user.findUnique({
			where: { discordUserId }
		});
	}

	throw new Error('findUniqueUser requires either discordUserId or dbUserId');
}
