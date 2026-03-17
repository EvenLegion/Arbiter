import type { InteractionDeferReplyOptions, InteractionEditReplyOptions, InteractionReplyOptions } from 'discord.js';

export type InteractionResponderPayload =
	| string
	| {
			content?: string | null;
			flags?: InteractionReplyOptions['flags'];
			embeds?: InteractionReplyOptions['embeds'];
			components?: InteractionReplyOptions['components'];
	  };

export function toInteractionReplyPayload(payload: InteractionResponderPayload): string | InteractionReplyOptions {
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

export function toInteractionEditReplyPayload(payload: InteractionResponderPayload): string | InteractionEditReplyOptions {
	if (typeof payload === 'string') {
		return payload;
	}

	return {
		content: payload.content ?? undefined,
		embeds: payload.embeds,
		components: payload.components
	};
}

export function toInteractionDeferReplyOptions(options?: {
	flags?: InteractionDeferReplyOptions['flags'];
}): InteractionDeferReplyOptions | undefined {
	if (!options) {
		return undefined;
	}

	return {
		flags: options.flags
	};
}
