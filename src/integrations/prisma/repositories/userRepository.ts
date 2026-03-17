import { z } from 'zod';

import { DISCORD_MAX_NICKNAME_LENGTH } from '../../../lib/constants';
import { findManyUsers as readManyUsers, findUniqueUser as readUser } from '../user/read';
import { updateUserNickname as writeUserNickname, upsertUser as writeUser } from '../user/write';

const UPDATE_USER_NICKNAME_SCHEMA = z.object({
	discordUserId: z.string().trim().min(1),
	discordNickname: z.string().trim().min(1).max(DISCORD_MAX_NICKNAME_LENGTH)
});

function getUser(params: { discordUserId?: string; dbUserId?: string }) {
	const hasDiscordUserId = typeof params.discordUserId === 'string';
	const hasDbUserId = typeof params.dbUserId === 'string';

	if (hasDbUserId) {
		return readUser({
			dbUserId: params.dbUserId
		});
	}
	if (hasDiscordUserId) {
		return readUser({
			discordUserId: params.discordUserId
		});
	}

	throw new Error('userRepository.get requires either discordUserId or dbUserId');
}

function listUsers(params: { dbUserIds?: string[]; discordUserIds?: string[] } = {}) {
	const hasEmptyDbFilter = 'dbUserIds' in params && Array.isArray(params.dbUserIds) && params.dbUserIds.length === 0;
	const hasEmptyDiscordFilter = 'discordUserIds' in params && Array.isArray(params.discordUserIds) && params.discordUserIds.length === 0;
	if (hasEmptyDbFilter || hasEmptyDiscordFilter) {
		return Promise.resolve([]);
	}

	const uniqueDbUserIds = params.dbUserIds ? [...new Set(params.dbUserIds)] : undefined;
	const uniqueDiscordUserIds = params.discordUserIds ? [...new Set(params.discordUserIds)] : undefined;

	return readManyUsers({
		dbUserIds: uniqueDbUserIds,
		discordUserIds: uniqueDiscordUserIds
	});
}

function upsertUser(params: {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	discordAvatarUrl: string;
	overwriteDiscordNickname?: boolean;
}) {
	return writeUser(params);
}

function updateNickname(params: { discordUserId: string; discordNickname: string }) {
	const parsed = UPDATE_USER_NICKNAME_SCHEMA.parse(params);

	return writeUserNickname({
		discordUserId: parsed.discordUserId,
		discordNickname: parsed.discordNickname
	});
}

export const userRepository = {
	get: getUser,
	list: listUsers,
	upsert: upsertUser,
	updateNickname
};
