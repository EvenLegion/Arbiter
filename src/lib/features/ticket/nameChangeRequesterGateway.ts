import { getDbUser } from '../../discord/userDirectoryGateway';

export function createNameChangeRequesterGateway({ fallbackUsername }: { fallbackUsername: string }) {
	return async (discordUserId: string) => {
		const requesterDbUser = await getDbUser({ discordUserId });
		if (!requesterDbUser) {
			return null;
		}

		return {
			dbUserId: requesterDbUser.id,
			currentName: requesterDbUser.discordNickname || requesterDbUser.discordUsername || fallbackUsername
		};
	};
}
