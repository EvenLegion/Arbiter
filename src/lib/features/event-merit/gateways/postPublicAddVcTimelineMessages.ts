import type { Guild, VoiceBasedChannel } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { resolveEventVoiceChannel } from './resolveEventChannels';

export async function postPublicAddVcTimelineMessages({
	guild,
	parentVoiceChannelId,
	childVoiceChannelId,
	childVoiceChannel,
	content,
	eventSessionId,
	logger
}: {
	guild: Guild;
	parentVoiceChannelId: string | null;
	childVoiceChannelId: string;
	childVoiceChannel: VoiceBasedChannel | null;
	content: string;
	eventSessionId: number;
	logger: ExecutionContext['logger'];
}) {
	let childPosted = false;
	let parentPosted = false;

	if (childVoiceChannel && 'send' in childVoiceChannel && typeof childVoiceChannel.send === 'function') {
		const message = await childVoiceChannel.send({ content }).catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					eventSessionId,
					voiceChannelId: childVoiceChannelId
				},
				'Failed to post add-vc announcement in child VC chat'
			);
			return null;
		});
		childPosted = Boolean(message);
	} else {
		logger.warn(
			{
				eventSessionId,
				voiceChannelId: childVoiceChannelId
			},
			'Child voice channel does not support VC chat messages for add-vc announcement'
		);
	}

	if (parentVoiceChannelId) {
		const parentVoiceChannel = await resolveEventVoiceChannel(guild, parentVoiceChannelId);
		if (parentVoiceChannel && 'send' in parentVoiceChannel && typeof parentVoiceChannel.send !== 'undefined') {
			const message = await parentVoiceChannel.send({ content }).catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						eventSessionId,
						voiceChannelId: parentVoiceChannelId
					},
					'Failed to post add-vc announcement in parent VC chat'
				);
				return null;
			});
			parentPosted = Boolean(message);
		} else {
			logger.warn(
				{
					eventSessionId,
					voiceChannelId: parentVoiceChannelId
				},
				'Parent voice channel does not support VC chat messages for add-vc announcement'
			);
		}
	} else {
		logger.warn(
			{
				eventSessionId,
				childVoiceChannelId
			},
			'Parent VC channel id is missing on event session while posting add-vc announcement'
		);
	}

	return {
		childPosted,
		parentPosted
	};
}
