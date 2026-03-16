import { findManyUsers } from '../findManyUsers';
import { findUniqueUser } from '../findUniqueUser';
import { updateUserNickname } from '../updateUserNickname';
import { upsertUser } from '../upsertUser';

function listUsers(params: Parameters<typeof findManyUsers>[0] = {}) {
	const hasEmptyDbFilter = 'dbUserIds' in params && Array.isArray(params.dbUserIds) && params.dbUserIds.length === 0;
	const hasEmptyDiscordFilter = 'discordUserIds' in params && Array.isArray(params.discordUserIds) && params.discordUserIds.length === 0;
	if (hasEmptyDbFilter || hasEmptyDiscordFilter) {
		return Promise.resolve([]);
	}

	return findManyUsers(params);
}

export const userRepository = {
	get: findUniqueUser,
	list: listUsers,
	upsert: upsertUser,
	updateNickname: updateUserNickname
};
