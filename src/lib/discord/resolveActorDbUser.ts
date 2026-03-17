import type { ActorCapabilityDeps } from './actorCapabilityTypes';

export async function resolveActorDbUserWithDeps(
	deps: Pick<ActorCapabilityDeps, 'getDbUser'>,
	{
		discordUserId
	}: {
		discordUserId: string;
	}
) {
	let dbUserLookupError: unknown;
	const dbUser = await deps
		.getDbUser?.({
			discordUserId
		})
		.catch((error: unknown) => {
			dbUserLookupError = error;
			return null;
		});
	if (!dbUser) {
		return {
			kind: 'db_user_not_found' as const,
			...(dbUserLookupError ? { error: dbUserLookupError } : {})
		};
	}

	return {
		kind: 'ok' as const,
		dbUser
	};
}
