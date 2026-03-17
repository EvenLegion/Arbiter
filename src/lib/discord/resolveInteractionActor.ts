import type { InteractionPreflightDeps, ResolveInteractionActorParams, ResolvedInteractionActor } from './interactionPreflightTypes';
import { resolveActorCoreWithDeps } from './actorCapabilityResolver';

export async function resolveInteractionActorWithDeps(
	deps: InteractionPreflightDeps,
	{
		guild,
		discordUserId,
		responder,
		logger,
		logMessage,
		failureMessage,
		requestId = false,
		capabilityRequirement = 'none',
		resolveDbUser = false,
		dbUserFailureMessage = 'Could not resolve your database user. Please contact TECH with:',
		unauthorizedMessage = 'You are not authorized to perform this action.',
		discordTag
	}: ResolveInteractionActorParams
): Promise<ResolvedInteractionActor | null> {
	const resolved = await resolveActorCoreWithDeps(deps, {
		guild,
		discordUserId,
		capabilityRequirement,
		resolveDbUser
	});

	if (resolved.kind === 'guild_not_found' || resolved.kind === 'member_not_found') {
		if (resolved.error) {
			logger.error(
				{
					err: resolved.error,
					discordUserId
				},
				logMessage
			);
		}
		await responder.fail(failureMessage, {
			requestId
		});
		return null;
	}

	if (resolved.kind === 'insufficient_capability') {
		await responder.fail(unauthorizedMessage);
		return null;
	}

	if (resolved.kind === 'db_user_not_found') {
		logger.error(
			{
				err: resolved.error,
				discordUserId
			},
			'Failed to resolve interaction actor database user'
		);
		await responder.fail(dbUserFailureMessage, {
			requestId: true
		});
		return null;
	}

	return {
		member: resolved.member,
		dbUser: resolved.dbUser,
		actor: {
			discordUserId,
			dbUserId: resolved.dbUser?.id ?? null,
			capabilities: resolved.capabilities,
			discordTag
		}
	};
}
