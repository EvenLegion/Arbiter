import { DivisionKind } from '@prisma/client';
import { container } from '@sapphire/framework';
import type { Guild, GuildMember } from 'discord.js';

import { ENV_DISCORD } from '../../config/env';
import type { ActorContext } from '../services/_shared/actor';
import type { InteractionResponder } from './interactionResponder';

type ResolveConfiguredGuildParams = {
	interaction: {
		guild?: Guild | null;
	};
	responder: InteractionResponder;
	logger: {
		error: (...values: readonly unknown[]) => void;
	};
	logMessage: string;
	failureMessage: string;
	requestId?: boolean;
};

type ResolveGuildMemberParams = {
	guild: Guild;
	discordUserId: string;
	responder: InteractionResponder;
	logger: {
		error: (...values: readonly unknown[]) => void;
	};
	logMessage: string;
	failureMessage: string;
	requestId?: boolean;
};

type ResolveInteractionActorParams = ResolveGuildMemberParams & {
	capabilityRequirement?: 'none' | 'staff' | 'staff-or-centurion';
	resolveDbUser?: boolean;
	dbUserFailureMessage?: string;
	unauthorizedMessage?: string;
	discordTag?: string;
};

export type ResolvedInteractionActor = {
	member: GuildMember;
	dbUser: Awaited<ReturnType<typeof container.utilities.userDirectory.get>> | null;
	actor: ActorContext;
};

export async function resolveConfiguredGuild({
	interaction,
	responder,
	logger,
	logMessage,
	failureMessage,
	requestId = false
}: ResolveConfiguredGuildParams): Promise<Guild | null> {
	const guild =
		interaction.guild ??
		(await container.utilities.guild.getOrThrow().catch((error: unknown) => {
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

export async function resolveGuildMember({
	guild,
	discordUserId,
	responder,
	logger,
	logMessage,
	failureMessage,
	requestId = false
}: ResolveGuildMemberParams): Promise<GuildMember | null> {
	const member = await container.utilities.member
		.getOrThrow({
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

export async function resolveInteractionActor({
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
}: ResolveInteractionActorParams): Promise<ResolvedInteractionActor | null> {
	const member = await resolveGuildMember({
		guild,
		discordUserId,
		responder,
		logger,
		logMessage,
		failureMessage,
		requestId
	});
	if (!member) {
		return null;
	}

	const [isStaff, isCenturion] = await Promise.all([
		container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
			member,
			requiredRoleKinds: [DivisionKind.STAFF]
		}),
		container.utilities.divisionRolePolicy.memberHasDivision({
			member,
			divisionDiscordRoleId: ENV_DISCORD.CENT_ROLE_ID
		})
	]);

	if ((capabilityRequirement === 'staff' && !isStaff) || (capabilityRequirement === 'staff-or-centurion' && !isStaff && !isCenturion)) {
		await responder.fail(unauthorizedMessage);
		return null;
	}

	const dbUser = resolveDbUser
		? await container.utilities.userDirectory
				.getOrThrow({
					discordUserId
				})
				.catch(async (error: unknown) => {
					logger.error(
						{
							err: error,
							discordUserId
						},
						'Failed to resolve interaction actor database user'
					);
					await responder.fail(dbUserFailureMessage, {
						requestId: true
					});
					return null;
				})
		: null;
	if (resolveDbUser && !dbUser) {
		return null;
	}

	return {
		member,
		dbUser,
		actor: {
			discordUserId,
			dbUserId: dbUser?.id ?? null,
			capabilities: {
				isStaff,
				isCenturion
			},
			discordTag
		}
	};
}
