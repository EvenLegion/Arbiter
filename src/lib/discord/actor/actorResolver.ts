import { DivisionKind } from '@prisma/client';
import type { Guild, GuildMember } from 'discord.js';

import { hasStaffOrCenturionEquivalentCapability } from '../../services/_shared/actor';
import type { ActorCapabilities } from '../../services/_shared/actor';
import type { ActorCapabilityDeps, CapabilityRequirement, ResolveActorCoreResult } from './actorTypes';

export type { ActorCapabilityDeps, CapabilityRequirement, ResolveActorCoreResult } from './actorTypes';

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
		(capabilityRequirement === 'staff-or-centurion' && !hasStaffOrCenturionEquivalentCapability(capabilities))
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

async function resolveActorIdentityWithDeps(
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

async function resolveActorDbUserWithDeps(
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

async function resolveMemberCapabilitiesWithDeps(
	deps: Pick<ActorCapabilityDeps, 'hasDivisionKindRole' | 'hasDivision' | 'centurionRoleId' | 'optioRoleId'>,
	{
		member
	}: {
		member: GuildMember;
	}
): Promise<ActorCapabilities> {
	const [isStaff, isCenturion, isOptio] = await Promise.all([
		deps.hasDivisionKindRole({
			member,
			requiredRoleKinds: [DivisionKind.STAFF]
		}),
		deps.hasDivision({
			member,
			divisionDiscordRoleId: deps.centurionRoleId
		}),
		deps.hasDivision({
			member,
			divisionDiscordRoleId: deps.optioRoleId
		})
	]);

	return {
		isStaff,
		isCenturion,
		isOptio
	};
}
