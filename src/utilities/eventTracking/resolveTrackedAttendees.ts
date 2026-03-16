import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../lib/logging/executionContext';
import { MissingTrackedChannelWarningStore } from './missingTrackedChannelWarningStore';

export async function resolveTrackedAttendeeDiscordUserIds({
	guild,
	eventSessionId,
	trackedVoiceChannelIds,
	context,
	warningStore,
	resolveVoiceChannel
}: {
	guild: Guild;
	eventSessionId: number;
	trackedVoiceChannelIds: string[];
	context: ExecutionContext;
	warningStore: MissingTrackedChannelWarningStore;
	resolveVoiceChannel: (params: { guild: Guild; channelId: string }) => Promise<{
		members: Map<string, { id: string; user: { bot: boolean } }>;
	} | null>;
}) {
	const logger = context.logger.child({ caller: 'resolveTrackedAttendeeDiscordUserIds' });
	const attendeeDiscordUserIds = new Set<string>();

	for (const channelId of trackedVoiceChannelIds) {
		const channel = await resolveVoiceChannel({
			guild,
			channelId
		});
		if (!channel) {
			if (
				warningStore.noteMissingChannel({
					eventSessionId,
					channelId
				})
			) {
				logger.warn(
					{
						channelId
					},
					'Tracked event channel is missing or not voice-based; skipping until it is available again'
				);
			} else {
				logger.trace(
					{
						channelId
					},
					'Skipping missing tracked event channel'
				);
			}
			continue;
		}

		warningStore.clearChannel({
			eventSessionId,
			channelId
		});

		for (const member of channel.members.values()) {
			if (member.user.bot) {
				continue;
			}

			attendeeDiscordUserIds.add(member.id);
		}
	}

	return [...attendeeDiscordUserIds];
}
