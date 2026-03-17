import type { Guild } from 'discord.js';

import { createGuildMemberAccessGateway } from './guildMemberAccessGateway';

export function createGuildMemberDirectMessageGateway({
	guild,
	logger
}: {
	guild: Guild;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
}) {
	const members = createGuildMemberAccessGateway({
		guild
	});

	return async ({ discordUserId, content, logMessage }: { discordUserId: string; content: string; logMessage: string }) => {
		const member = await members.getMember(discordUserId);
		if (!member) {
			return false;
		}

		return member.user
			.send(content)
			.then(() => true)
			.catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						targetDiscordUserId: discordUserId
					},
					logMessage
				);
				return false;
			});
	};
}
