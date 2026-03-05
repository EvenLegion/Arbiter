import { z } from 'zod';
import { prisma } from './prisma';

type UpdateUserNicknameParams = {
	discordUserId: string;
	discordNickname: string;
};

const UPDATE_USER_NICKNAME_SCHEMA = z.object({
	discordUserId: z.string().trim().min(1),
	discordNickname: z.string().trim().min(1).max(100)
});

export async function updateUserNickname(params: UpdateUserNicknameParams) {
	const parsed = UPDATE_USER_NICKNAME_SCHEMA.parse(params);

	return prisma.user.update({
		where: {
			discordUserId: parsed.discordUserId
		},
		data: {
			discordNickname: parsed.discordNickname
		}
	});
}
