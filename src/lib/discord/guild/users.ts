import { userRepository } from '../../../integrations/prisma/repositories';

export function getDbUser({ discordUserId, dbUserId }: { discordUserId?: string; dbUserId?: string }) {
	if (typeof discordUserId === 'string') {
		return userRepository.get({
			discordUserId
		});
	}

	if (typeof dbUserId === 'string') {
		return userRepository.get({
			dbUserId
		});
	}

	throw new Error('getDbUser requires either discordUserId or dbUserId');
}

export function getDbUserOrThrow({ discordUserId, dbUserId }: { discordUserId?: string; dbUserId?: string }) {
	if (typeof discordUserId === 'string') {
		return getDbUser({ discordUserId }).then((user) => {
			if (!user) {
				throw new Error(`User not found in database: discordUserId=${discordUserId}`);
			}

			return user;
		});
	}

	if (typeof dbUserId === 'string') {
		return getDbUser({ dbUserId }).then((user) => {
			if (!user) {
				throw new Error(`User not found in database: dbUserId=${dbUserId}`);
			}

			return user;
		});
	}

	throw new Error('getDbUserOrThrow requires either discordUserId or dbUserId');
}

export function listDbUsers({
	dbUserIds,
	discordUserIds
}: {
	dbUserIds?: string[];
	discordUserIds?: string[];
} = {}) {
	return userRepository.list({
		dbUserIds,
		discordUserIds
	});
}
