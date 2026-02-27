import type { VoiceState } from 'discord.js';
import type { ExecutionContext } from '../../logging/executionContext';
import { handleAuxVcVoiceStateUpdate } from './aux-vc/handleAuxVcVoiceStateUpdate';

type HandleVoiceStateUpdateParams = {
    oldState: VoiceState;
    newState: VoiceState;
    context: ExecutionContext;
};

export async function handleVoiceStateUpdate({
    oldState,
    newState,
    context,
}: HandleVoiceStateUpdateParams) {
    await handleAuxVcVoiceStateUpdate({ oldState, newState, context });
}
