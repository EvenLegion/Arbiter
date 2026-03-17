import type { Guild } from 'discord.js';

import { createGuildMemberDirectMessageGateway } from '../../guild-member/guildMemberDirectMessageGateway';

export function createManualMeritDirectMessageGateway({
	guild,
	logger
}: {
	guild: Guild;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
}) {
	const sendDirectMessage = createGuildMemberDirectMessageGateway({
		guild,
		logger
	});

	return {
		sendRecipientDm: ({ discordUserId, content }: { discordUserId: string; content: string }) =>
			sendDirectMessage({
				discordUserId,
				content,
				logMessage: 'Failed to DM manual merit award to recipient'
			})
	};
}
