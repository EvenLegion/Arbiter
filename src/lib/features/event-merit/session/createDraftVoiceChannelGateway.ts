import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { resolveEventVoiceChannel } from '../gateways/resolveEventChannels';

export function createDraftVoiceChannelGateway({ guild, logger }: { guild: Guild; logger: ExecutionContext['logger'] }) {
	return {
		renamePrimaryVoiceChannel: async ({ channelId, name, reason }: { channelId: string; name: string; reason: string }) => {
			const primaryVoiceChannel = await resolveEventVoiceChannel(guild, channelId);
			if (!primaryVoiceChannel) {
				return;
			}

			await primaryVoiceChannel.setName(name, reason).catch((renameErr: unknown) => {
				logger.error(
					{
						err: renameErr,
						primaryVoiceChannelId: channelId
					},
					'Failed to rename primary voice channel for event draft'
				);
			});
		}
	};
}
