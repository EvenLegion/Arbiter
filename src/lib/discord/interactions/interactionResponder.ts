import { MessageFlags, type InteractionDeferReplyOptions, type InteractionEditReplyOptions, type InteractionReplyOptions } from 'discord.js';

import type { ExecutionContext } from '../../logging/executionContext';
import { toErrorLogFields } from '../../logging/errorDetails';

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

type DeliveryState = 'initial' | 'deferred-reply' | 'deferred-update' | 'replied';
type DeliveryMode = 'auto' | 'reply' | 'editReply' | 'followUp';

type InteractionResponderParams = {
	interaction: ReplyLikeInteraction;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
	caller: string;
};

export type InteractionResponderPayload =
	| string
	| {
			content?: string | null;
			flags?: InteractionReplyOptions['flags'];
			embeds?: InteractionReplyOptions['embeds'];
			components?: InteractionReplyOptions['components'];
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

function resolveInitialDeliveryState(interaction: { deferred: boolean; replied: boolean }): DeliveryState {
	if (interaction.replied) {
		return 'replied';
	}

	if (interaction.deferred) {
		return 'deferred-reply';
	}

	return 'initial';
}

function advanceDeliveryState(
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

function resolveDeliveryMode(deliveryState: DeliveryState, delivery: DeliveryMode): Exclude<DeliveryMode, 'auto'> {
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

function buildInteractionFailurePayload({ content, requestId }: { content: string; requestId?: string }): InteractionResponderPayload {
	return {
		content: requestId ? `${content} requestId=\`${requestId}\`` : content,
		flags: MessageFlags.Ephemeral
	};
}

function toInteractionReplyPayload(payload: InteractionResponderPayload): string | InteractionReplyOptions {
	if (typeof payload === 'string') {
		return payload;
	}

	return {
		content: payload.content ?? undefined,
		flags: payload.flags,
		embeds: payload.embeds,
		components: payload.components
	};
}

function toInteractionEditReplyPayload(payload: InteractionResponderPayload): string | InteractionEditReplyOptions {
	if (typeof payload === 'string') {
		return payload;
	}

	return {
		content: payload.content ?? undefined,
		embeds: payload.embeds,
		components: payload.components
	};
}

function toInteractionDeferReplyOptions(options?: { flags?: InteractionDeferReplyOptions['flags'] }): InteractionDeferReplyOptions | undefined {
	if (!options) {
		return undefined;
	}

	return {
		flags: options.flags
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
