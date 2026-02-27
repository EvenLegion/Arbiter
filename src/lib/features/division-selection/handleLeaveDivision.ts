import { type ButtonInteraction } from 'discord.js';

import { Division, DivisionKind } from '@prisma/client';
import type { ExecutionContext } from '../../logging/executionContext';

type HandleLeaveDivisionParams = {
	userDbId: string;
	interaction: ButtonInteraction;
	parsedDivisionSelection: { action: 'leave'; code: 'combat' | 'industrial' };
	divisions: Division[];
	context: ExecutionContext;
};

export async function handleLeaveDivision({ userDbId, interaction, parsedDivisionSelection, divisions, context }: HandleLeaveDivisionParams) {
	const caller = 'handleLeaveDivision';
	const logger = context.logger.child({ caller });

	const guildMember = await interaction.guild?.members.fetch(interaction.user.id);
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
			content: `There was an error processing your selection. Please contact a TECH member with the following: discordMessageId=${interaction.id} customButtonId=${interaction.customId}`
		});
		return;
	}

	const targetKind = parsedDivisionSelection.code.toUpperCase() as DivisionKind;
	const sameKindRoleIds = divisions
		.filter((division) => division.kind === targetKind && division.discordRoleId)
		.map((division) => division.discordRoleId!) as string[];
	const userKindRoleIds = sameKindRoleIds.filter((roleId) => guildMember.roles.cache.has(roleId));
	if (userKindRoleIds.length === 0) {
		logger.warn(
			{
				userDbId,
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId,
				parsedDivisionSelection
			},
			'User does not have division role for this kind'
		);
		interaction.editReply({ content: `You are not a member of any ${parsedDivisionSelection.code} division.` });
		return;
	}

	await guildMember.roles.remove(userKindRoleIds, `Left ${parsedDivisionSelection.code} division via button selection`);
	logger.info(
		{
			userDbId,
			discordMessageId: interaction.id,
			discordUserId: interaction.user.id,
			discordUsername: interaction.user.username,
			customButtonId: interaction.customId,
			removedRoles: userKindRoleIds.map((roleId) => ({
				roleId,
				roleName: getDivisionNameByDiscordRoleId({ divisions, discordRoleId: roleId })
			}))
		},
		'Removed division role(s) from user'
	);

	interaction.editReply({ content: `Removed your ${parsedDivisionSelection.code} division membership.` });
	return;
}

function getDivisionNameByDiscordRoleId({ divisions, discordRoleId }: { divisions: Division[]; discordRoleId: string }) {
	return divisions.find((division) => division.discordRoleId === discordRoleId)?.name;
}
