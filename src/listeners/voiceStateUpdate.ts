import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { VoiceState } from 'discord.js';
import { handleVoiceStateUpdate } from '../lib/features/voice/handleVoiceStateUpdate';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Listener.Options>({
	event: 'voiceStateUpdate'
})
export class VoiceStateUpdateListener extends Listener {
	public override async run(oldState: VoiceState, newState: VoiceState) {
		const context = createExecutionContext({
			bindings: {
				flow: 'listener.voiceStateUpdate',
				discordUserId: newState.id,
				guildId: newState.guild.id
			}
		});

		await handleVoiceStateUpdate({ oldState, newState, context });
	}
}
