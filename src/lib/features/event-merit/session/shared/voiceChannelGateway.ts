import type { Guild, VoiceBasedChannel } from 'discord.js';

import { getVoiceBasedGuildChannel } from '../../../../discord/guild/configuredGuild';
import type { ExecutionContext } from '../../../../logging/executionContext';

export function createVoiceChannelGateway({
	guild,
	logger,
	fallbackVoiceChannel = null
}: {
	guild: Guild;
	logger: ExecutionContext['logger'];
	fallbackVoiceChannel?: VoiceBasedChannel | null;
}) {
	const resolveVoiceChannel = async (channelId: string) => {
		if (fallbackVoiceChannel?.id === channelId) {
			return fallbackVoiceChannel;
		}

		return getVoiceBasedGuildChannel({
			guild,
			channelId
		});
	};

	return {
		resolveVoiceChannel,
		renameVoiceChannel: async ({
			channelId,
			name,
			reason,
			missingChannelLogMessage,
			renameFailureLogMessage,
			logBindings = {}
		}: {
			channelId: string;
			name: string;
			reason: string;
			missingChannelLogMessage: string;
			renameFailureLogMessage: string;
			logBindings?: Record<string, unknown>;
		}) => {
			const channel = await resolveVoiceChannel(channelId);
			if (!channel) {
				logger.warn(
					{
						channelId,
						...logBindings
					},
					missingChannelLogMessage
				);
				return;
			}

			await channel.setName(name, reason).catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						channelId,
						...logBindings
					},
					renameFailureLogMessage
				);
			});
		}
	};
}
