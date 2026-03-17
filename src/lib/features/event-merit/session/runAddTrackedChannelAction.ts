import type { VoiceBasedChannel, Guild } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { addTrackedChannel } from '../../../services/event-lifecycle/eventLifecycleService';
import { createAddTrackedChannelDeps } from './createAddTrackedChannelDeps';
import { presentEventAddVcResult } from './eventAddVcResultPresenter';

export async function runAddTrackedChannelAction({
	guild,
	targetVoiceChannel,
	logger,
	input
}: {
	guild: Guild;
	targetVoiceChannel: VoiceBasedChannel | null;
	logger: ExecutionContext['logger'];
	input: Parameters<typeof addTrackedChannel>[1];
}) {
	const result = await addTrackedChannel(
		createAddTrackedChannelDeps({
			guild,
			targetVoiceChannel,
			logger
		}),
		input
	);

	return presentEventAddVcResult(result);
}
