import type { InteractionPreflightDeps, ResolveConfiguredGuildParams } from './interactionPreflightTypes';

export async function resolveConfiguredGuildWithDeps(
	deps: Pick<InteractionPreflightDeps, 'getConfiguredGuild'>,
	{ interaction, responder, logger, logMessage, failureMessage, requestId = false }: ResolveConfiguredGuildParams
) {
	const guild =
		interaction.guild ??
		(await deps.getConfiguredGuild().catch((error: unknown) => {
			logger.error(
				{
					err: error
				},
				logMessage
			);
			return null;
		}));
	if (!guild) {
		await responder.fail(failureMessage, {
			requestId
		});
		return null;
	}

	return guild;
}
