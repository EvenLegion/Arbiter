import { MessageFlags, type InteractionDeferReplyOptions, type InteractionEditReplyOptions, type InteractionReplyOptions } from 'discord.js';

import type { ExecutionContext } from '../logging/executionContext';
import { toErrorLogFields } from '../logging/errorDetails';
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
			try {
				if (deferOptions) {
					await interaction.deferReply(deferOptions);
				} else {
					await interaction.deferReply();
				}
				deliveryState = advanceDeliveryState(deliveryState, 'deferred-reply');
				logger.debug('discord.reply.deferred');
			} catch (error) {
				logger.error(
					{
						...toErrorLogFields(error),
						caller
					},
					'discord.side_effect.failed'
				);
				throw error;
			}
		},
		deferEphemeralReply: async () => {
			try {
				await interaction.deferReply({
					flags: MessageFlags.Ephemeral
				});
				deliveryState = advanceDeliveryState(deliveryState, 'deferred-reply');
				logger.debug('discord.reply.deferred');
			} catch (error) {
				logger.error(
					{
						...toErrorLogFields(error),
						caller
					},
					'discord.side_effect.failed'
				);
				throw error;
			}
		},
		deferUpdate: async () => {
			const updateInteraction = interaction as ReplyLikeInteraction & Partial<UpdateLikeInteraction>;
			if (typeof updateInteraction.deferUpdate !== 'function') {
				return false;
			}

			try {
				await updateInteraction.deferUpdate();
				deliveryState = advanceDeliveryState(deliveryState, 'deferred-update');
				logger.debug('discord.update.deferred');
				return true;
			} catch (error) {
				logger.error(
					{
						...toErrorLogFields(error),
						caller
					},
					'discord.side_effect.failed'
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
				logDeliverySuccess({ logger, delivery: resolvedDelivery });
			} catch (error) {
				logger.error(
					{
						...toErrorLogFields(error),
						delivery: resolvedDelivery,
						caller
					},
					'discord.side_effect.failed'
				);
			}
		},
		safeReply: async (payload: InteractionResponderPayload) => {
			try {
				await interaction.reply(toInteractionReplyPayload(payload));
				deliveryState = advanceDeliveryState(deliveryState, 'reply');
				logger.debug('discord.reply.sent');
			} catch (error) {
				logger.error(
					{
						...toErrorLogFields(error),
						caller
					},
					'discord.side_effect.failed'
				);
			}
		},
		safeEditReply: async (payload: InteractionResponderPayload) => {
			try {
				await interaction.editReply(toInteractionEditReplyPayload(payload));
				logger.debug('discord.reply.edited');
			} catch (error) {
				logger.error(
					{
						...toErrorLogFields(error),
						caller
					},
					'discord.side_effect.failed'
				);
			}
		},
		safeFollowUp: async (payload: InteractionResponderPayload) => {
			try {
				await interaction.followUp(toInteractionReplyPayload(payload));
				logger.debug('discord.follow_up.sent');
			} catch (error) {
				logger.error(
					{
						...toErrorLogFields(error),
						caller
					},
					'discord.side_effect.failed'
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

function logDeliverySuccess({ logger, delivery }: { logger: ExecutionContext['logger']; delivery: Exclude<DeliveryMode, 'auto'> }) {
	if (delivery === 'editReply') {
		logger.debug('discord.reply.edited');
		return;
	}
	if (delivery === 'followUp') {
		logger.debug('discord.follow_up.sent');
		return;
	}

	logger.debug('discord.reply.sent');
}
