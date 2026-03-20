import { findManyUsers, findUniqueUser } from '../user/read';
import { updateUserNickname, upsertUser } from '../user/write';

function getUser(params: { discordUserId?: string; dbUserId?: string }) {
	const hasDiscordUserId = typeof params.discordUserId === 'string';
	const hasDbUserId = typeof params.dbUserId === 'string';

	if (hasDbUserId) {
		return findUniqueUser({
			dbUserId: params.dbUserId
		});
	}
	if (hasDiscordUserId) {
		return findUniqueUser({
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

	return findManyUsers({
		dbUserIds: uniqueDbUserIds,
		discordUserIds: uniqueDiscordUserIds
	});
}

export const userRepository = {
	get: getUser,
	list: listUsers,
	upsert: upsertUser,
	updateNickname: updateUserNickname
};
