import { ChannelType, ThreadAutoArchiveDuration, type ForumChannel, type TextChannel, type ThreadChannel } from 'discord.js';

import type { ExecutionContext } from '../../../../logging/executionContext';

export function createTrackingThreadGateway({
	trackingChannel,
	logger
}: {
	trackingChannel: TextChannel | ForumChannel;
	logger: ExecutionContext['logger'];
}) {
	return {
		createTrackingThread: async ({
			eventName,
			tierName,
			issuerTag,
			issuerDiscordUserId
		}: {
			eventName: string;
			tierName: string;
			issuerTag: string;
			issuerDiscordUserId: string;
		}) => {
			const thread = await createTrackingThread({
				channel: trackingChannel,
				eventName,
				tierName,
				issuerTag,
				issuerDiscordUserId
			}).catch((error: unknown) => {
				logger.error(
					{
						err: error,
						eventName
					},
					'Failed to create tracking thread for event draft'
				);
				return null;
			});
			return thread ? { threadId: thread.id } : null;
		},
		cleanupTrackingThread: async (threadId: string) => {
			await trackingChannel.threads
				.fetch(threadId)
				.then(async (thread) => thread?.delete('Cleaning up tracking thread after failed event draft creation'))
				.catch((cleanupErr: unknown) => {
					logger.warn(
						{
							err: cleanupErr,
							trackingThreadId: threadId
						},
						'Failed to cleanup tracking thread after draft creation error'
					);
				});
		}
	};
}

async function createTrackingThread({
	channel,
	eventName,
	tierName,
	issuerTag,
	issuerDiscordUserId
}: {
	channel: TextChannel | ForumChannel;
	eventName: string;
	tierName: string;
	issuerTag: string;
	issuerDiscordUserId: string;
}): Promise<ThreadChannel> {
	const threadName = buildTrackingThreadName({ eventName, tierName });
	const reason = `Event draft created by ${issuerTag} (${issuerDiscordUserId})`;

	if (channel.type === ChannelType.GuildForum) {
		return channel.threads.create({
			name: threadName,
			autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
			message: {
				content: `Initializing event thread for **${tierName} | ${eventName}**...`
			},
			reason
		});
	}

	return channel.threads.create({
		name: threadName,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
		reason
	});
}

function buildTrackingThreadName({ eventName, tierName }: { eventName: string; tierName: string }) {
	const safeEventName = eventName.slice(0, 64);
	return `${tierName} | ${safeEventName}`;
}
