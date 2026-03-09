import { prisma } from './prisma';

type UpsertUserParams = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	discordAvatarUrl: string;
	overwriteDiscordNickname?: boolean;
};

export async function upsertUser({
	discordUserId,
	discordUsername,
	discordNickname,
	discordAvatarUrl,
	overwriteDiscordNickname = false
}: UpsertUserParams) {
	const createData = {
		discordUsername,
		discordNickname,
		discordAvatarUrl
	};
	const updateData = {
		discordUsername,
		discordAvatarUrl,
		...(overwriteDiscordNickname ? { discordNickname } : {})
	};

	return prisma.user.upsert({
		where: { discordUserId },
		update: updateData,
		create: {
			discordUserId,
			...createData
		}
	});
}
