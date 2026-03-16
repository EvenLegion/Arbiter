import { MessageFlags } from 'discord.js';

import type { ExecutionContext } from '../logging/executionContext';

type BasicReplyPayload = string | { content?: string; flags?: MessageFlags; embeds?: unknown[]; components?: unknown[] };

type ReplyLikeInteraction = {
	reply: (...args: never[]) => Promise<unknown>;
	editReply: (...args: never[]) => Promise<unknown>;
	followUp: (...args: never[]) => Promise<unknown>;
	deferReply: (...args: never[]) => Promise<unknown>;
	deferred: boolean;
	replied: boolean;
};

type UpdateLikeInteraction = {
	deferUpdate: (...args: never[]) => Promise<unknown>;
};

type DeliveryMode = 'auto' | 'reply' | 'editReply' | 'followUp';

type InteractionResponderParams = {
	interaction: ReplyLikeInteraction;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
	caller: string;
};

export type InteractionResponder = ReturnType<typeof createInteractionResponder>;

export function createInteractionResponder({ interaction, context, logger, caller }: InteractionResponderParams) {
	let deliveryState: 'initial' | 'deferred-reply' | 'deferred-update' | 'replied' = interaction.replied
		? 'replied'
		: interaction.deferred
			? 'deferred-reply'
			: 'initial';

	return {
		deferReply: async (options?: { flags?: MessageFlags }) => {
			await interaction.deferReply(options as never);
			deliveryState = 'deferred-reply';
		},
		deferEphemeralReply: async () => {
			await interaction.deferReply({
				flags: MessageFlags.Ephemeral
			} as never);
			deliveryState = 'deferred-reply';
		},
		deferUpdate: async () => {
			const updateInteraction = interaction as ReplyLikeInteraction & Partial<UpdateLikeInteraction>;
			if (typeof updateInteraction.deferUpdate !== 'function') {
				return false;
			}

			try {
				await updateInteraction.deferUpdate();
				deliveryState = 'deferred-update';
				return true;
			} catch (error) {
				logger.warn(
					{
						err: error
					},
					`Failed to defer interaction update in ${caller}`
				);
				return false;
			}
		},
		fail: async (
			content: string,
			{
				requestId = false,
				delivery = 'auto'
			}: {
				requestId?: boolean;
				delivery?: DeliveryMode;
			} = {}
		) => {
			const resolvedDelivery = resolveDeliveryMode(deliveryState, delivery);
			const payload = {
				content: requestId ? appendRequestId(content, context.requestId) : content,
				flags: MessageFlags.Ephemeral
			};

			try {
				await send(interaction, resolvedDelivery, payload);
				if (resolvedDelivery === 'reply') {
					deliveryState = 'replied';
				}
			} catch (error) {
				logger.warn(
					{
						err: error,
						delivery: resolvedDelivery
					},
					`Failed to send failure response in ${caller}`
				);
			}
		},
		safeReply: async (payload: BasicReplyPayload) => {
			try {
				await interaction.reply(payload as never);
				deliveryState = 'replied';
			} catch (error) {
				logger.warn(
					{
						err: error
					},
					`Failed to send interaction reply in ${caller}`
				);
			}
		},
		safeEditReply: async (payload: BasicReplyPayload) => {
			try {
				await interaction.editReply(payload as never);
			} catch (error) {
				logger.warn(
					{
						err: error
					},
					`Failed to edit interaction reply in ${caller}`
				);
			}
		},
		safeFollowUp: async (payload: BasicReplyPayload) => {
			try {
				await interaction.followUp(payload as never);
			} catch (error) {
				logger.warn(
					{
						err: error
					},
					`Failed to send interaction follow-up in ${caller}`
				);
			}
		}
	};
}

function resolveDeliveryMode(
	deliveryState: 'initial' | 'deferred-reply' | 'deferred-update' | 'replied',
	delivery: DeliveryMode
): Exclude<DeliveryMode, 'auto'> {
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

async function send(interaction: ReplyLikeInteraction, delivery: Exclude<DeliveryMode, 'auto'>, payload: BasicReplyPayload) {
	if (delivery === 'editReply') {
		return interaction.editReply(payload as never);
	}
	if (delivery === 'followUp') {
		return interaction.followUp(payload as never);
	}

	return interaction.reply(payload as never);
}

function appendRequestId(content: string, requestId: string) {
	return `${content} requestId=\`${requestId}\``;
}
