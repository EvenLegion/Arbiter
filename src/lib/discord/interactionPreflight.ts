import { ENV_DISCORD } from '../../config/env';
import { memberHasDivision, memberHasDivisionKindRole } from './divisionPolicyGateway';
import { getConfiguredGuild } from './configuredGuildGateway';
import { getGuildMemberOrThrow } from './guildMemberGateway';
import { resolveConfiguredGuildWithDeps } from './resolveConfiguredGuild';
import { resolveGuildMemberWithDeps } from './resolveGuildMember';
import { resolveInteractionActorWithDeps } from './resolveInteractionActor';
import { getDbUserOrThrow } from './userDirectoryGateway';
import type {
	InteractionPreflightDeps,
	ResolveConfiguredGuildParams,
	ResolveGuildMemberParams,
	ResolveInteractionActorParams,
	ResolvedInteractionActor
} from './interactionPreflightTypes';

const DEFAULT_INTERACTION_PREFLIGHT_DEPS: InteractionPreflightDeps = {
	getConfiguredGuild,
	getMember: getGuildMemberOrThrow,
	hasDivisionKindRole: memberHasDivisionKindRole,
	hasDivision: memberHasDivision,
	getDbUser: ({ discordUserId }) => getDbUserOrThrow({ discordUserId }),
	centurionRoleId: ENV_DISCORD.CENT_ROLE_ID
};

export type { ResolveConfiguredGuildParams, ResolveGuildMemberParams, ResolveInteractionActorParams, ResolvedInteractionActor };

export async function resolveConfiguredGuild(params: ResolveConfiguredGuildParams) {
	return resolveConfiguredGuildWithDeps(DEFAULT_INTERACTION_PREFLIGHT_DEPS, params);
}

export async function resolveGuildMember(params: ResolveGuildMemberParams) {
	return resolveGuildMemberWithDeps(DEFAULT_INTERACTION_PREFLIGHT_DEPS, params);
}

export async function resolveInteractionActor(params: ResolveInteractionActorParams): Promise<ResolvedInteractionActor | null> {
	return resolveInteractionActorWithDeps(DEFAULT_INTERACTION_PREFLIGHT_DEPS, params);
}
