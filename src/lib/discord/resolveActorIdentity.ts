import type { Guild } from 'discord.js';

import type { ActorCapabilityDeps } from './actorCapabilityTypes';

export async function resolveActorIdentityWithDeps(
	deps: Pick<ActorCapabilityDeps, 'getConfiguredGuild' | 'getMember'>,
	{
		guild,
		discordUserId
	}: {
		guild?: Guild | null;
		discordUserId: string;
	}
) {
	let guildLookupError: unknown;
	const resolvedGuild =
		guild ??
		(await deps.getConfiguredGuild?.().catch((error: unknown) => {
			guildLookupError = error;
			return null;
		})) ??
		null;
	if (!resolvedGuild) {
		return {
			kind: 'guild_not_found' as const,
			...(guildLookupError ? { error: guildLookupError } : {})
		};
	}

	let memberLookupError: unknown;
	const member = await deps
		.getMember({
			guild: resolvedGuild,
			discordUserId
		})
		.catch((error: unknown) => {
			memberLookupError = error;
			return null;
		});
	if (!member) {
		return {
			kind: 'member_not_found' as const,
			...(memberLookupError ? { error: memberLookupError } : {})
		};
	}

	return {
		kind: 'ok' as const,
		guild: resolvedGuild,
		member
	};
}
