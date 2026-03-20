import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { resolveEventGuildChannel } from './resolveEventChannels';

export async function postChildVcAddedTimelineMessage({
	guild,
	threadId,
	eventName,
	actorDiscordUserId,
	channelId,
	parentVoiceChannelId,
	logger
}: {
	guild: Guild;
	threadId: string;
	eventName: string;
	actorDiscordUserId: string;
	channelId: string;
	parentVoiceChannelId: string | null;
	logger: ExecutionContext['logger'];
}) {
	const threadChannel = await resolveEventGuildChannel(guild, threadId);
	if (!threadChannel || !threadChannel.isTextBased()) {
		logger.warn(
			{
				threadId,
				channelId
			},
			'Could not resolve event thread while logging child VC addition'
		);
		return;
	}

	await threadChannel
		.send({
			content: `<@${actorDiscordUserId}> added <#${channelId}> as a sub channel under Main channel ${
				parentVoiceChannelId ? `<#${parentVoiceChannelId}>` : 'unknown Main channel'
			} for **${eventName}**.`
		})
		.catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					threadId,
					channelId
				},
				'Failed to post child VC addition log to event thread'
			);
		});
}
