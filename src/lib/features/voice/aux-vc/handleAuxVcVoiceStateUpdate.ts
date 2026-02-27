import type { VoiceState } from "discord.js";
import { TimerManager } from "@sapphire/timer-manager";

import { ENV_CONFIG } from "../../../../config/env";
import { monitorState } from "./monitorState";
import { reconcileEligibility } from "./reconcileEligibility";
import { createChildExecutionContext, type ExecutionContext } from '../../../logging/executionContext';

type HandleAuxVcVoiceStateUpdateParams = {
    oldState: VoiceState;
    newState: VoiceState;
    context: ExecutionContext;
};

export async function handleAuxVcVoiceStateUpdate(
    { oldState, newState, context }: HandleAuxVcVoiceStateUpdateParams,
) {
    const channelChanged = oldState.channelId !== newState.channelId;
    const selfMuteChanged = oldState.selfMute !== newState.selfMute;
    const serverMuteChanged = oldState.serverMute !== newState.serverMute;

    if (!channelChanged && !selfMuteChanged && !serverMuteChanged) {
        return;
    }

    if (monitorState.pendingReconcileTimeout) {
        TimerManager.clearTimeout(monitorState.pendingReconcileTimeout);
    }

    monitorState.pendingReconcileTimeout = TimerManager.setTimeout(() => {
        monitorState.pendingReconcileTimeout = null;
        void reconcileEligibility({
            context: createChildExecutionContext({
                context,
                bindings: {
                    step: 'voiceStateDebounceReconcile',
                },
            }),
        });
    }, ENV_CONFIG.AUX_VC_RECONCILE_DEBOUNCE_MS);
}
