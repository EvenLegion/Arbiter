export type DeliveryState = 'initial' | 'deferred-reply' | 'deferred-update' | 'replied';
export type DeliveryMode = 'auto' | 'reply' | 'editReply' | 'followUp';

export function resolveDeliveryMode(deliveryState: DeliveryState, delivery: DeliveryMode): Exclude<DeliveryMode, 'auto'> {
	if (delivery !== 'auto') {
		return delivery;
	}

	if (deliveryState === 'deferred-reply') {
		return 'editReply';
	}
	if (deliveryState === 'deferred-update' || deliveryState === 'replied') {
		return 'followUp';
	}

	return 'reply';
}
