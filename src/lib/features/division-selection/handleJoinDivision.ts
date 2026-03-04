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
	const guild = await container.utilities.guild.getOrThrow().catch(() => null);
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
		interaction.editReply({
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
		interaction.editReply({ content: `You are already a member of the ${selectedDivision.name} division.` });
		return;
	}

	const sameKindDivisionRoleIds = divisions
		.filter((division) => division.kind === selectedDivision.kind && division.discordRoleId)
		.map((division) => division.discordRoleId!) as string[];

	const existingSameKindRoleIds = sameKindDivisionRoleIds.filter((roleId) => guildMember.roles.cache.has(roleId));
	if (existingSameKindRoleIds.length > 0) {
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
				existingSameKindRoleIds
			},
			'User already has division role(s) for this kind. Replacing existing role(s)'
		);

		await guildMember.roles.remove(existingSameKindRoleIds, `Replacing ${selectedDivision.kind} division role via button selection`);
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

	interaction.editReply({ content: `You have joined the ${selectedDivision.name} division.` });
	return;
}
