import type { Guild } from 'discord.js';

import { resolveEventGuildChannel } from './resolveEventChannels';

export async function postEventDraftAnnouncement({
	guild,
	threadId,
	actorDiscordUserId,
	eventName
}: {
	guild: Guild;
	threadId: string;
	actorDiscordUserId: string;
	eventName: string;
}) {
	const threadChannel = await resolveEventGuildChannel(guild, threadId);
	if (!threadChannel || !threadChannel.isTextBased()) {
		return;
	}

	await threadChannel.send({
		content: `Event draft **${eventName}** created by <@${actorDiscordUserId}>.`
	});
}
