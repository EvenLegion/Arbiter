import { container } from '@sapphire/framework';

export function createNameChangeRequesterGateway({ fallbackUsername }: { fallbackUsername: string }) {
	return async (discordUserId: string) => {
		const requesterDbUser = await container.utilities.userDirectory.get({
			discordUserId
		});
		if (!requesterDbUser) {
			return null;
		}

		return {
			dbUserId: requesterDbUser.id,
			currentName: requesterDbUser.discordNickname || requesterDbUser.discordUsername || fallbackUsername
		};
	};
}
