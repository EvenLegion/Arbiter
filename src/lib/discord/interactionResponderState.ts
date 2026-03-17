import type { DeliveryState } from './interactionResponderDelivery';

type ReplyStateLikeInteraction = {
	deferred: boolean;
	replied: boolean;
};

export function resolveInitialDeliveryState(interaction: ReplyStateLikeInteraction): DeliveryState {
	if (interaction.replied) {
		return 'replied';
	}

	if (interaction.deferred) {
		return 'deferred-reply';
	}

	return 'initial';
}

export function advanceDeliveryState(
	currentState: DeliveryState,
	delivery: 'reply' | 'editReply' | 'followUp' | 'deferred-reply' | 'deferred-update'
): DeliveryState {
	if (delivery === 'reply') {
		return 'replied';
	}

	if (delivery === 'deferred-reply') {
		return 'deferred-reply';
	}

	if (delivery === 'deferred-update') {
		return 'deferred-update';
	}

	return currentState;
}
