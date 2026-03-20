import { z } from 'zod';

import { DISCORD_MAX_NICKNAME_LENGTH } from '../../../lib/constants';
import { prisma } from '../prisma';

const UPDATE_USER_NICKNAME_SCHEMA = z.object({
	discordUserId: z.string().trim().min(1),
	discordNickname: z.string().trim().min(1).max(DISCORD_MAX_NICKNAME_LENGTH)
});

export async function upsertUser(params: {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	discordAvatarUrl: string;
	overwriteDiscordNickname?: boolean;
}) {
	const { discordUserId, discordUsername, discordNickname, discordAvatarUrl, overwriteDiscordNickname = false } = params;

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
		where: {
			discordUserId
		},
		update: updateData,
		create: {
			discordUserId,
			...createData
		}
	});
}

export async function updateUserNickname(params: { discordUserId: string; discordNickname: string }) {
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
