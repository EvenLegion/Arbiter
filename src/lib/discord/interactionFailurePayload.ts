import { MessageFlags } from 'discord.js';

import type { InteractionResponderPayload } from './interactionResponderPayload';

export function buildInteractionFailurePayload({ content, requestId }: { content: string; requestId?: string }): InteractionResponderPayload {
	return {
		content: requestId ? appendRequestId(content, requestId) : content,
		flags: MessageFlags.Ephemeral
	};
}

function appendRequestId(content: string, requestId: string) {
	return `${content} requestId=\`${requestId}\``;
}
