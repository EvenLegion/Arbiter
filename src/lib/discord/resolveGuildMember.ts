import type { InteractionPreflightDeps, ResolveGuildMemberParams } from './interactionPreflightTypes';

export async function resolveGuildMemberWithDeps(
	deps: Pick<InteractionPreflightDeps, 'getMember'>,
	{ guild, discordUserId, responder, logger, logMessage, failureMessage, requestId = false }: ResolveGuildMemberParams
) {
	const member = await deps
		.getMember({
			guild,
			discordUserId
		})
		.catch((error: unknown) => {
			logger.error(
				{
					err: error,
					discordUserId
				},
				logMessage
			);
			return null;
		});
	if (!member) {
		await responder.fail(failureMessage, {
			requestId
		});
		return null;
	}

	return member;
}
