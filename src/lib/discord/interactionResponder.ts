import { MessageFlags, type InteractionDeferReplyOptions, type InteractionEditReplyOptions, type InteractionReplyOptions } from 'discord.js';

import type { ExecutionContext } from '../logging/executionContext';
import { resolveDeliveryMode, type DeliveryMode, type DeliveryState } from './interactionResponderDelivery';
import { buildInteractionFailurePayload } from './interactionFailurePayload';
import {
	toInteractionDeferReplyOptions,
	toInteractionEditReplyPayload,
	toInteractionReplyPayload,
	type InteractionResponderPayload
} from './interactionResponderPayload';
import { advanceDeliveryState, resolveInitialDeliveryState } from './interactionResponderState';

type ReplyLikeInteraction = {
	reply: (payload: string | InteractionReplyOptions) => Promise<unknown>;
	editReply: (payload: string | InteractionEditReplyOptions) => Promise<unknown>;
	followUp: (payload: string | InteractionReplyOptions) => Promise<unknown>;
	deferReply: (options?: InteractionDeferReplyOptions) => Promise<unknown>;
	deferred: boolean;
	replied: boolean;
};

type UpdateLikeInteraction = {
	deferUpdate: () => Promise<unknown>;
};

type InteractionResponderParams = {
	interaction: ReplyLikeInteraction;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
	caller: string;
};

export type InteractionResponder = ReturnType<typeof createInteractionResponder>;

export function createInteractionResponder({ interaction, context, logger, caller }: InteractionResponderParams) {
	let deliveryState: DeliveryState = resolveInitialDeliveryState(interaction);

	return {
		deferReply: async (options?: { flags?: InteractionDeferReplyOptions['flags'] }) => {
			const deferOptions = toInteractionDeferReplyOptions(options);
			if (deferOptions) {
				await interaction.deferReply(deferOptions);
			} else {
				await interaction.deferReply();
			}
			deliveryState = advanceDeliveryState(deliveryState, 'deferred-reply');
		},
		deferEphemeralReply: async () => {
			await interaction.deferReply({
				flags: MessageFlags.Ephemeral
			});
			deliveryState = advanceDeliveryState(deliveryState, 'deferred-reply');
		},
		deferUpdate: async () => {
			const updateInteraction = interaction as ReplyLikeInteraction & Partial<UpdateLikeInteraction>;
			if (typeof updateInteraction.deferUpdate !== 'function') {
				return false;
			}

			try {
				await updateInteraction.deferUpdate();
				deliveryState = advanceDeliveryState(deliveryState, 'deferred-update');
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
			const payload = buildInteractionFailurePayload({
				content,
				...(requestId ? { requestId: context.requestId } : {})
			});

			try {
				await send(interaction, resolvedDelivery, payload);
				deliveryState = advanceDeliveryState(deliveryState, resolvedDelivery);
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
		safeReply: async (payload: InteractionResponderPayload) => {
			try {
				await interaction.reply(toInteractionReplyPayload(payload));
				deliveryState = advanceDeliveryState(deliveryState, 'reply');
			} catch (error) {
				logger.warn(
					{
						err: error
					},
					`Failed to send interaction reply in ${caller}`
				);
			}
		},
		safeEditReply: async (payload: InteractionResponderPayload) => {
			try {
				await interaction.editReply(toInteractionEditReplyPayload(payload));
			} catch (error) {
				logger.warn(
					{
						err: error
					},
					`Failed to edit interaction reply in ${caller}`
				);
			}
		},
		safeFollowUp: async (payload: InteractionResponderPayload) => {
			try {
				await interaction.followUp(toInteractionReplyPayload(payload));
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

async function send(interaction: ReplyLikeInteraction, delivery: Exclude<DeliveryMode, 'auto'>, payload: InteractionResponderPayload) {
	if (delivery === 'editReply') {
		return interaction.editReply(toInteractionEditReplyPayload(payload));
	}
	if (delivery === 'followUp') {
		return interaction.followUp(toInteractionReplyPayload(payload));
	}

	return interaction.reply(toInteractionReplyPayload(payload));
}
