import { type ButtonInteraction } from 'discord.js';
import { container } from '@sapphire/framework';

import { Division } from '@prisma/client';
import type { ExecutionContext } from '../../logging/executionContext';

type HandleJoinDivisionParams = {
	userDbId: string;
	interaction: ButtonInteraction;
	parsedDivisionSelection: { action: 'join'; code: string };
	divisions: Division[];
	context: ExecutionContext;
};

export async function handleJoinDivision({ userDbId, interaction, parsedDivisionSelection, divisions, context }: HandleJoinDivisionParams) {
	const caller = 'handleJoinDivision';
	const logger = context.logger.child({ caller });
	const guild = await container.utilities.guild.getOrThrow().catch((error: unknown) => {
		logger.error(
			{
				err: error
			},
			'Failed to resolve configured guild while handling division join'
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

	const selectedDivisionCode = parsedDivisionSelection.code.toUpperCase();
	const selectedDivision = divisions.find((division) => division.code === selectedDivisionCode);
	if (!selectedDivision || !selectedDivision.discordRoleId) {
		logger.error(
			{
				userDbId,
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId,
				selectedDivision
			},
			'Selected division not found'
		);
		await interaction.editReply({
			content: `There was an error processing your selection. Please contact a TECH member with the following: requestId=${context.requestId}`
		});
		return;
	}

	if (guildMember.roles.cache.has(selectedDivision.discordRoleId)) {
		logger.warn(
			{
				userDbId,
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId,
				selectedDivisionId: selectedDivision.id,
				selectedDivisionRoleId: selectedDivision.discordRoleId
			},
			'User already has selected division role'
		);
		await interaction.editReply({ content: `You are already a member of the ${selectedDivision.name} division.` });
		return;
	}

	const selectableDivisionRoleIds = divisions.filter((division) => division.discordRoleId).map((division) => division.discordRoleId!) as string[];

	const existingSelectedRoleIds = selectableDivisionRoleIds.filter((roleId) => guildMember.roles.cache.has(roleId));
	if (existingSelectedRoleIds.length > 0) {
		logger.warn(
			{
				userDbId,
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId,
				selectedDivisionKind: selectedDivision.kind,
				selectedDivisionName: selectedDivision.name,
				selectedDivisionId: selectedDivision.id,
				existingSelectedRoleIds
			},
			'User already has another selectable division role. Replacing existing role(s)'
		);

		await guildMember.roles.remove(existingSelectedRoleIds, `Replacing selectable division role via button selection`);
	}

	await guildMember.roles.add(selectedDivision.discordRoleId, `Joined ${selectedDivision.name} division via button selection`);
	logger.info(
		{
			userDbId,
			discordMessageId: interaction.id,
			discordUserId: interaction.user.id,
			discordUsername: interaction.user.username,
			customButtonId: interaction.customId,
			selectedDivision: selectedDivision.name,
			addedRole: {
				roleId: selectedDivision.discordRoleId,
				roleName: selectedDivision.name
			}
		},
		'Added division role to user'
	);

	await interaction.editReply({ content: `You have joined the ${selectedDivision.name} division.` });
	return;
}
