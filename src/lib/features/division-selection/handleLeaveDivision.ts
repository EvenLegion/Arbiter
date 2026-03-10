import { type ButtonInteraction } from 'discord.js';
import { container } from '@sapphire/framework';

import { Division } from '@prisma/client';
import type { ExecutionContext } from '../../logging/executionContext';

type HandleLeaveDivisionParams = {
	userDbId: string;
	interaction: ButtonInteraction;
	parsedDivisionSelection: { action: 'leave'; code: string };
	divisions: Division[];
	context: ExecutionContext;
};

export async function handleLeaveDivision({ userDbId, interaction, parsedDivisionSelection, divisions, context }: HandleLeaveDivisionParams) {
	const caller = 'handleLeaveDivision';
	const logger = context.logger.child({ caller });

	const guild = await container.utilities.guild.getOrThrow().catch((error: unknown) => {
		logger.error(
			{
				err: error
			},
			'Failed to resolve configured guild while handling division leave'
		);
		return null;
	});
	if (!guild) {
		logger.error(
			{
				userDbId,
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId
			},
			'Guild not found for interaction'
		);
		await interaction.editReply({
			content: `There was an error processing your selection. Please contact a TECH member with the following: requestId=${context.requestId}`
		});
		return;
	}

	const guildMember = await container.utilities.member
		.getOrThrow({
			guild,
			discordUserId: interaction.user.id
		})
		.catch(() => null);
	if (!guildMember) {
		logger.error(
			{
				userDbId,
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId
			},
			'Guild member not found'
		);
		await interaction.editReply({
			content: `There was an error processing your selection. Please contact a TECH member with the following: requestId=${context.requestId}`
		});
		return;
	}

	const selectableDivisionRoles = divisions.filter(
		(division) => division.discordRoleId !== null && guildMember.roles.cache.has(division.discordRoleId)
	);
	if (selectableDivisionRoles.length === 0) {
		logger.warn(
			{
				userDbId,
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId,
				parsedDivisionSelection
			},
			'User does not have any selectable division role'
		);
		await interaction.editReply({ content: 'You are not currently a member of any division.' });
		return;
	}

	const selectableDivisionRoleIds = selectableDivisionRoles.map((division) => division.discordRoleId!) as string[];
	await guildMember.roles.remove(selectableDivisionRoleIds, 'Left division via button selection');
	logger.info(
		{
			userDbId,
			discordMessageId: interaction.id,
			discordUserId: interaction.user.id,
			discordUsername: interaction.user.username,
			customButtonId: interaction.customId,
			removedRoles: selectableDivisionRoles.map((division) => ({
				roleId: division.discordRoleId,
				roleName: division.name
			}))
		},
		'Removed division role(s) from user'
	);

	await interaction.editReply({ content: 'Removed your division membership.' });
	return;
}
