import { prisma } from './prisma';

type UpsertUserParams = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	discordAvatarUrl: string;
};

export async function upsertUser({ discordUserId, discordUsername, discordNickname, discordAvatarUrl }: UpsertUserParams) {
	const data = {
		discordUsername,
		discordNickname,
		discordAvatarUrl
	};

	return prisma.user.upsert({
		where: { discordUserId },
		update: data,
		create: {
			discordUserId,
			...data
		}
	});
}
