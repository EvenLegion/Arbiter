import { ENV_DISCORD } from '../../../config/env';
import type { DivisionKind } from '@prisma/client';
import type { Guild, GuildMember } from 'discord.js';

import type { ActorContext } from '../../services/_shared/actor';
import { resolveActorCoreWithDeps } from '../actor/actorResolver';
import { memberHasDivision, memberHasDivisionKindRole } from '../guild/divisions';
import { getConfiguredGuild } from '../guild/configuredGuild';
import { getGuildMemberOrThrow } from '../guild/guildMembers';
import { getDbUserOrThrow } from '../guild/users';
import type { InteractionResponder } from './interactionResponder';

export type InteractionPreflightLogger = {
	error: (...values: readonly unknown[]) => void;
};

export type InteractionPreflightDeps = {
	getConfiguredGuild: () => Promise<Guild>;
	getMember: (params: { guild: Guild; discordUserId: string }) => Promise<GuildMember>;
	hasDivisionKindRole: (params: { member: GuildMember; requiredRoleKinds: DivisionKind[] }) => Promise<boolean>;
	hasDivision: (params: { member: GuildMember; divisionDiscordRoleId: string }) => Promise<boolean>;
	getDbUser: (params: { discordUserId: string }) => Promise<{ id: string }>;
	centurionRoleId: string;
};

export type ResolveConfiguredGuildParams = {
	interaction: {
		guild?: Guild | null;
	};
	responder: InteractionResponder;
	logger: InteractionPreflightLogger;
	logMessage: string;
	failureMessage: string;
	requestId?: boolean;
};

export type ResolveGuildMemberParams = {
	guild: Guild;
	discordUserId: string;
	responder: InteractionResponder;
	logger: InteractionPreflightLogger;
	logMessage: string;
	failureMessage: string;
	requestId?: boolean;
};

export type ResolveInteractionActorParams = ResolveGuildMemberParams & {
	capabilityRequirement?: 'none' | 'staff' | 'staff-or-centurion';
	resolveDbUser?: boolean;
	dbUserFailureMessage?: string;
	unauthorizedMessage?: string;
	discordTag?: string;
};

export type ResolvedInteractionActor = {
	member: GuildMember;
	dbUser: { id: string } | null;
	actor: ActorContext;
};

const DEFAULT_INTERACTION_PREFLIGHT_DEPS: InteractionPreflightDeps = {
	getConfiguredGuild,
	getMember: getGuildMemberOrThrow,
	hasDivisionKindRole: memberHasDivisionKindRole,
	hasDivision: memberHasDivision,
	getDbUser: ({ discordUserId }) => getDbUserOrThrow({ discordUserId }),
	centurionRoleId: ENV_DISCORD.CENT_ROLE_ID
};

export async function resolveConfiguredGuild(params: ResolveConfiguredGuildParams) {
	return resolveConfiguredGuildWithDeps(DEFAULT_INTERACTION_PREFLIGHT_DEPS, params);
}

export async function resolveGuildMember(params: ResolveGuildMemberParams) {
	return resolveGuildMemberWithDeps(DEFAULT_INTERACTION_PREFLIGHT_DEPS, params);
}

export async function resolveInteractionActor(params: ResolveInteractionActorParams): Promise<ResolvedInteractionActor | null> {
	return resolveInteractionActorWithDeps(DEFAULT_INTERACTION_PREFLIGHT_DEPS, params);
}

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
