export type NicknameSyncTarget = {
	id: string;
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
};

type UserDirectoryRecord = {
	id: string;
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
};

type UserDirectoryGateway = {
	get: (params: { discordUserId: string }) => Promise<UserDirectoryRecord | null>;
	findMany: () => Promise<UserDirectoryRecord[]>;
};

export async function resolveNicknameSyncTargets(
	userDirectory: UserDirectoryGateway,
	{ requestedDiscordUserId }: { requestedDiscordUserId?: string }
): Promise<NicknameSyncTarget[]> {
	if (requestedDiscordUserId) {
		const target = await userDirectory.get({
			discordUserId: requestedDiscordUserId
		});

		return target
			? [
					{
						id: target.id,
						discordUserId: target.discordUserId,
						discordUsername: target.discordUsername,
						discordNickname: target.discordNickname
					}
				]
			: [];
	}

	const users = await userDirectory.findMany();
	return users.map((user) => ({
		id: user.id,
		discordUserId: user.discordUserId,
		discordUsername: user.discordUsername,
		discordNickname: user.discordNickname
	}));
}
