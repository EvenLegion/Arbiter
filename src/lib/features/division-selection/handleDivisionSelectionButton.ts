import { MessageFlags, type ButtonInteraction, type GuildMember } from 'discord.js';
import { DivisionKind } from '@prisma/client';

import { ENV_DISCORD } from '../../../config/env/discord';
import { container } from '@sapphire/framework';
import { findUniqueUser, upsertUser } from '../../../integrations/prisma';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { handleJoinDivision } from './handleJoinDivision';
import { handleLeaveDivision } from './handleLeaveDivision';
import type { ParseDivisionSelectionResult } from './parseDivisionSelection';

type HandleDivisionSelectionButtonParams = {
	interaction: ButtonInteraction;
	parsedDivisionSelection: Exclude<ParseDivisionSelectionResult, null>;
	context: ExecutionContext;
};

export async function handleDivisionSelectionButton({ interaction, parsedDivisionSelection, context }: HandleDivisionSelectionButtonParams) {
	const caller = 'handleDivisionSelectionButton';
	const logger = context.logger.child({ caller });

	logger.trace(
		{
			discordMessageId: interaction.id,
			discordUserId: interaction.user.id,
			discordUsername: interaction.user.username,
			customButtonId: interaction.customId
		},
		'Handling division selection button'
	);

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const guild = await container.utilities.guild.getOrThrow().catch(() => null);
	if (!guild) {
		await interaction.editReply({
			content: 'This action can only be used in a server.'
		});
		return;
	}

	let guildMember: GuildMember;
	try {
		guildMember = await container.utilities.member.getOrThrow({
			guild,
			discordUserId: interaction.user.id
		});
	} catch {
		await interaction.editReply({
			content: `Could not resolve your member record. Please contact TECH with: discordMessageId=${interaction.id}`
		});
		return;
	}

	const isLegionnaire = await container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
		member: guildMember,
		requiredRoleKinds: [DivisionKind.LEGIONNAIRE]
	});
	if (!isLegionnaire) {
		logger.error(
			{
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId
			},
			'User is not a Legionnaire'
		);

		await interaction.editReply({
			content: `Only <@&${ENV_DISCORD.LGN_ROLE_ID}> members can select a division. Please contact a TECH member with the following: requestId=${context.requestId}`
		});
		return;
	}

	logger.info(
		{
			discordMessageId: interaction.id,
			discordUserId: interaction.user.id,
			discordUsername: interaction.user.username,
			customButtonId: interaction.customId
		},
		'processing division button interaction'
	);

	let dbUser = await findUniqueUser({ discordUserId: interaction.user.id });
	if (!dbUser) {
		logger.warn(
			{
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId
			},
			'Discord user not found in database. Upserting user'
		);

		dbUser = await upsertUser({
			discordUserId: interaction.user.id,
			discordUsername: interaction.user.username,
			discordNickname: interaction.user.globalName ?? interaction.user.username,
			discordAvatarUrl: interaction.user.displayAvatarURL()
		});
	}

	const divisions = await container.utilities.divisionCache.get({
		kinds: [DivisionKind.COMBAT, DivisionKind.INDUSTRIAL]
	});

	if (parsedDivisionSelection.action === 'join') {
		return handleJoinDivision({
			userDbId: dbUser.id,
			interaction,
			parsedDivisionSelection: { action: 'join', code: parsedDivisionSelection.code },
			divisions,
			context: createChildExecutionContext({
				context,
				bindings: {
					flowAction: 'joinDivision'
				}
			})
		});
	} else if (parsedDivisionSelection.action === 'leave') {
		return handleLeaveDivision({
			userDbId: dbUser.id,
			interaction,
			parsedDivisionSelection: { action: 'leave', code: parsedDivisionSelection.code },
			divisions,
			context: createChildExecutionContext({
				context,
				bindings: {
					flowAction: 'leaveDivision'
				}
			})
		});
	}

	logger.error(
		{
			userDbId: dbUser.id,
			discordMessageId: interaction.id,
			discordUserId: interaction.user.id,
			discordUsername: interaction.user.username,
			customButtonId: interaction.customId,
			parsedDivisionSelection
		},
		'Unknown division selection action'
	);

	interaction.editReply({
		content: `There was an error processing your selection. Please contact a TECH member with the following: discordMessageId=${interaction.id} customButtonId=${interaction.customId}`
	});
	return;
}
