import { EventSessionChannelKind, EventSessionMessageKind } from '@prisma/client';
import type { Guild } from 'discord.js';
import { findManyEventSessionMessages, findUniqueEventSessionById } from '../../../../integrations/prisma';
import { buildEventTrackingSummaryPayload } from '../ui/buildEventTrackingSummaryPayload';

type SyncTrackingSummaryMessageParams = {
	guild: Guild;
	eventSession: NonNullable<Awaited<ReturnType<typeof findUniqueEventSessionById>>>;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
};

export async function syncTrackingSummaryMessage({ guild, eventSession, logger }: SyncTrackingSummaryMessageParams) {
	const trackedVoiceChannelIds = eventSession.channels
		.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
		.map((channel) => channel.channelId);

	const summaryPayload = buildEventTrackingSummaryPayload({
		eventSessionId: eventSession.id,
		eventName: eventSession.name,
		tierName: eventSession.eventTier.name,
		tierMeritAmount: eventSession.eventTier.meritAmount,
		hostDiscordUserId: eventSession.hostUser.discordUserId,
		trackedChannelIds: trackedVoiceChannelIds,
		trackingThreadId: eventSession.threadId,
		state: eventSession.state
	});

	const summaryMessageRefs = await findManyEventSessionMessages({
		eventSessionId: eventSession.id,
		kinds: [EventSessionMessageKind.TRACKING_SUMMARY, EventSessionMessageKind.TRACKING_SUMMARY_PARENT_VC]
	});

	for (const summaryRef of summaryMessageRefs) {
		const channel = guild.channels.cache.get(summaryRef.channelId) ?? (await guild.channels.fetch(summaryRef.channelId).catch(() => null));
		if (!channel || !channel.isTextBased()) {
			continue;
		}

		await channel.messages
			.fetch(summaryRef.messageId)
			.then((message) =>
				message.edit({
					content: null,
					...summaryPayload
				})
			)
			.catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						eventSessionId: eventSession.id,
						channelId: summaryRef.channelId,
						messageId: summaryRef.messageId
					},
					'Failed to sync tracking summary message'
				);
			});
	}
}
