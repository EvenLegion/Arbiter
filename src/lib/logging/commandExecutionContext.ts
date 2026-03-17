import type { ChatInputCommandInteraction } from 'discord.js';

import { createExecutionContext } from './executionContext';

export function createCommandExecutionContext({
	interaction,
	flow,
	bindings = {}
}: {
	interaction: Pick<ChatInputCommandInteraction, 'id' | 'user'>;
	flow: string;
	bindings?: Record<string, unknown>;
}) {
	return createExecutionContext({
		bindings: {
			flow,
			discordInteractionId: interaction.id,
			discordUserId: interaction.user.id,
			...bindings
		}
	});
}
