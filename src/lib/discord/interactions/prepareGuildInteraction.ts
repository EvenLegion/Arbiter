import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../logging/executionContext';
import { resolveConfiguredGuild } from './interactionPreflight';
import { createInteractionResponder, type InteractionResponder } from './interactionResponder';

type GuildInteraction = Parameters<typeof createInteractionResponder>[0]['interaction'] & {
	guild?: Guild | null;
};

export async function prepareGuildInteraction({
	interaction,
	context,
	caller,
	loggerBindings,
	guildLogMessage,
	guildFailureMessage,
	requestId = false,
	defer = 'none'
}: {
	interaction: GuildInteraction;
	context: ExecutionContext;
	caller: string;
	loggerBindings?: Record<string, unknown>;
	guildLogMessage: string;
	guildFailureMessage: string;
	requestId?: boolean;
	defer?: 'none' | 'reply' | 'ephemeralReply';
}): Promise<{
	guild: NonNullable<Awaited<ReturnType<typeof resolveConfiguredGuild>>>;
	logger: ExecutionContext['logger'];
	responder: InteractionResponder;
} | null> {
	const logger = context.logger.child({
		caller,
		...(loggerBindings ?? {})
	});
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	if (defer === 'ephemeralReply') {
		await responder.deferEphemeralReply();
	} else if (defer === 'reply') {
		await responder.deferReply();
	}

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: guildLogMessage,
		failureMessage: guildFailureMessage,
		requestId
	});
	if (!guild) {
		return null;
	}

	return {
		guild,
		logger,
		responder
	};
}
