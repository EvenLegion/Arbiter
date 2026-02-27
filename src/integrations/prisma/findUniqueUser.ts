import { prisma } from './prisma';

type FindUniqueUserParams = {
	discordUserId?: string;
	dbUserId?: string;
};

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
