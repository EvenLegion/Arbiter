import { EventSessionChannelKind } from '@prisma/client';
import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import type { EventLifecycleEventSession } from '../../../services/event-lifecycle';
import { resolveEventGuildChannel } from './resolveEventChannels';

export async function postReviewSubmissionTimelineMessages({
	guild,
	eventSession,
	actorDiscordUserId,
	mode,
	logger
}: {
	guild: Guild;
	eventSession: EventLifecycleEventSession;
	actorDiscordUserId: string;
	mode: 'with' | 'without';
	logger: ExecutionContext['logger'];
}) {
	const trackedVoiceChannelIds = eventSession.channels
		.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
		.map((channel) => channel.channelId);

	const timelineChannelIds = [...new Set([eventSession.threadId, ...trackedVoiceChannelIds])];
	const timelineMessage =
		mode === 'with'
			? `Event review for **${eventSession.name}** was submitted by <@${actorDiscordUserId}> with **merits awarded**.`
			: `Event review for **${eventSession.name}** was submitted by <@${actorDiscordUserId}> with **no merits awarded**.`;
	const hostMeritMessage = mode === 'with' ? `<@${eventSession.hostUser.discordUserId}> was awarded the **Centurion Host Merit**.` : null;

	for (const channelId of timelineChannelIds) {
		const channel = await resolveEventGuildChannel(guild, channelId);
		if (!channel || !('send' in channel) || typeof channel.send !== 'function') {
			logger.warn(
				{
					eventSessionId: eventSession.id,
					channelId
				},
				'Skipping post-review timeline update because channel is missing or not send-capable'
			);
			continue;
		}

		await channel.send({ content: timelineMessage }).catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					eventSessionId: eventSession.id,
					channelId
				},
				'Failed to post review-submitted update to tracked voice channel'
			);
		});

		if (channelId !== eventSession.threadId || !hostMeritMessage) {
			continue;
		}

		await channel.send({ content: hostMeritMessage }).catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					eventSessionId: eventSession.id,
					channelId
				},
				'Failed to post host merit update to event thread'
			);
		});
	}
}
