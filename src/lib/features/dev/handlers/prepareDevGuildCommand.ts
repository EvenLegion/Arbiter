import type { Subcommand } from '@sapphire/plugin-subcommands';

import { resolveConfiguredGuild } from '../../../discord/interactions/interactionPreflight';
import { createInteractionResponder, type InteractionResponder } from '../../../discord/interactions/interactionResponder';
import type { ExecutionContext } from '../../../logging/executionContext';

export async function prepareDevGuildCommand({
	interaction,
	context,
	caller,
	loggerBindings,
	guildLogMessage,
	guildFailureMessage
}: {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
	caller: string;
	loggerBindings?: Record<string, unknown>;
	guildLogMessage: string;
	guildFailureMessage: string;
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

	await responder.deferEphemeralReply();

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: guildLogMessage,
		failureMessage: guildFailureMessage,
		requestId: true
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
