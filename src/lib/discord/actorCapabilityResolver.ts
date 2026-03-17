import type { Guild } from 'discord.js';

import type { ActorCapabilityDeps, CapabilityRequirement, ResolveActorCoreResult } from './actorCapabilityTypes';
import { resolveActorDbUserWithDeps } from './resolveActorDbUser';
import { resolveActorIdentityWithDeps } from './resolveActorIdentity';
import { resolveMemberCapabilitiesWithDeps } from './resolveMemberCapabilities';

export type { ActorCapabilityDeps, CapabilityRequirement, ResolvedActorCapabilities, ResolveActorCoreResult } from './actorCapabilityTypes';
export { resolveMemberCapabilitiesWithDeps } from './resolveMemberCapabilities';

export async function resolveActorCoreWithDeps(
	deps: ActorCapabilityDeps,
	{
		guild,
		discordUserId,
		capabilityRequirement = 'none',
		resolveDbUser = false
	}: {
		guild?: Guild | null;
		discordUserId: string;
		capabilityRequirement?: CapabilityRequirement;
		resolveDbUser?: boolean;
	}
): Promise<ResolveActorCoreResult> {
	const identity = await resolveActorIdentityWithDeps(deps, {
		guild,
		discordUserId
	});
	if (identity.kind !== 'ok') {
		return identity;
	}

	const capabilities = await resolveMemberCapabilitiesWithDeps(deps, {
		member: identity.member
	});
	if (
		(capabilityRequirement === 'staff' && !capabilities.isStaff) ||
		(capabilityRequirement === 'staff-or-centurion' && !capabilities.isStaff && !capabilities.isCenturion)
	) {
		return {
			kind: 'insufficient_capability',
			guild: identity.guild,
			member: identity.member,
			capabilities
		};
	}

	if (!resolveDbUser) {
		return {
			kind: 'ok',
			guild: identity.guild,
			member: identity.member,
			capabilities,
			dbUser: null
		};
	}

	const dbUser = await resolveActorDbUserWithDeps(deps, {
		discordUserId
	});
	if (dbUser.kind !== 'ok') {
		return {
			kind: 'db_user_not_found',
			guild: identity.guild,
			member: identity.member,
			capabilities,
			...(dbUser.error ? { error: dbUser.error } : {})
		};
	}

	return {
		kind: 'ok',
		guild: identity.guild,
		member: identity.member,
		capabilities,
		dbUser: dbUser.dbUser
	};
}
