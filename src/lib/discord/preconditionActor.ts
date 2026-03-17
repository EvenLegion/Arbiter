import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';

import { ENV_DISCORD } from '../../config/env';
import { createCommandExecutionContext } from '../logging/commandExecutionContext';
import { resolveActorCoreWithDeps } from './actorCapabilityResolver';
import { memberHasDivision, memberHasDivisionKindRole } from './divisionPolicyGateway';
import { getConfiguredGuild } from './configuredGuildGateway';
import { getGuildMemberOrThrow } from './guildMemberGateway';

type CapabilityRequirement = 'staff' | 'staff-or-centurion';

export type ResolvedPreconditionActor =
	| {
			ok: true;
			member: GuildMember;
			isStaff: boolean;
			isCenturion: boolean;
	  }
	| {
			ok: false;
			message: string;
	  };

export async function resolvePreconditionActor({
	interaction,
	preconditionName,
	capabilityRequirement
}: {
	interaction: ChatInputCommandInteraction;
	preconditionName: 'StaffOnly' | 'EventOperatorOnly';
	capabilityRequirement: CapabilityRequirement;
}): Promise<ResolvedPreconditionActor> {
	const context = createCommandExecutionContext({
		interaction,
		flow: `precondition.${preconditionName}`,
		logReceived: false
	});
	const logger = context.logger;
	const resolved = await resolveActorCoreWithDeps(
		{
			getConfiguredGuild,
			getMember: getGuildMemberOrThrow,
			hasDivisionKindRole: memberHasDivisionKindRole,
			hasDivision: memberHasDivision,
			centurionRoleId: ENV_DISCORD.CENT_ROLE_ID
		},
		{
			discordUserId: interaction.user.id,
			capabilityRequirement
		}
	);

	if (resolved.kind === 'guild_not_found') {
		if (resolved.error) {
			logger.error(
				{
					err: resolved.error,
					precondition: preconditionName
				},
				'discord.precondition.failed'
			);
		}
		return {
			ok: false,
			message: 'This command can only be used in a server.'
		};
	}

	if (resolved.kind === 'member_not_found') {
		logger.info(
			{
				precondition: preconditionName
			},
			'discord.precondition.denied'
		);
		return {
			ok: false,
			message: 'Could not resolve your member record in this server.'
		};
	}

	if (resolved.kind === 'insufficient_capability' && capabilityRequirement === 'staff') {
		logger.info(
			{
				precondition: preconditionName
			},
			'discord.precondition.denied'
		);
		return {
			ok: false,
			message: 'Only staff members can perform this action.'
		};
	}

	if (resolved.kind === 'insufficient_capability' && capabilityRequirement === 'staff-or-centurion') {
		logger.info(
			{
				precondition: preconditionName
			},
			'discord.precondition.denied'
		);
		return {
			ok: false,
			message: 'Only staff members or Centurions can perform this action.'
		};
	}

	if (resolved.kind !== 'ok') {
		logger.info(
			{
				precondition: preconditionName,
				resolvedKind: resolved.kind
			},
			'discord.precondition.denied'
		);
		return {
			ok: false,
			message: 'Only staff members can perform this action.'
		};
	}

	return {
		ok: true,
		member: resolved.member,
		isStaff: resolved.capabilities.isStaff,
		isCenturion: resolved.capabilities.isCenturion
	};
}
