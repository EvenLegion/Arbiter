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
		interaction.editReply({
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
		interaction.editReply({
			content: `There was an error processing your selection. Please contact a TECH member with the following: requestId=${context.requestId}`
		});
		return;
	}

	const targetDivisionCode = parsedDivisionSelection.code.toUpperCase();
	const selectedDivision = divisions.find((division) => division.code === targetDivisionCode);
	if (!selectedDivision || !selectedDivision.discordRoleId) {
		logger.error(
			{
				userDbId,
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId,
				targetDivisionCode
			},
			'Selected division not found while handling leave'
		);
		interaction.editReply({
			content: `There was an error processing your selection. Please contact a TECH member with the following: requestId=${context.requestId}`
		});
		return;
	}

	if (!guildMember.roles.cache.has(selectedDivision.discordRoleId)) {
		logger.warn(
			{
				userDbId,
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId,
				targetDivisionCode
			},
			'User does not have selected division role'
		);
		interaction.editReply({ content: `You are not a member of the ${selectedDivision.name} division.` });
		return;
	}

	await guildMember.roles.remove(selectedDivision.discordRoleId, `Left ${selectedDivision.name} division via button selection`);
	logger.info(
		{
			userDbId,
			discordMessageId: interaction.id,
			discordUserId: interaction.user.id,
			discordUsername: interaction.user.username,
			customButtonId: interaction.customId,
			removedRole: {
				roleId: selectedDivision.discordRoleId,
				roleName: selectedDivision.name
			}
		},
		'Removed division role(s) from user'
	);

	interaction.editReply({ content: `Removed your ${selectedDivision.name} division membership.` });
	return;
}
