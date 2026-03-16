import { type ButtonInteraction } from 'discord.js';
import { DivisionKind } from '@prisma/client';

import { container } from '@sapphire/framework';
import { createInteractionResponder } from '../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveGuildMember } from '../../discord/interactionPreflight';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { applyDivisionSelection } from '../../services/division-selection/divisionSelectionService';
import { buildDivisionSelectionReply } from './buildDivisionSelectionReply';
import type { ParseDivisionSelectionResult } from './parseDivisionSelection';

type HandleDivisionSelectionButtonParams = {
	interaction: ButtonInteraction;
	parsedDivisionSelection: Exclude<ParseDivisionSelectionResult, null>;
	context: ExecutionContext;
};

export async function handleDivisionSelectionButton({ interaction, parsedDivisionSelection, context }: HandleDivisionSelectionButtonParams) {
	const caller = 'handleDivisionSelectionButton';
	const logger = context.logger.child({ caller });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	logger.trace(
		{
			discordMessageId: interaction.id,
			discordUserId: interaction.user.id,
			discordUsername: interaction.user.username,
			customButtonId: interaction.customId
		},
		'Handling division selection button'
	);

	await responder.deferEphemeralReply();

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild while handling division selection button',
		failureMessage: 'This action can only be used in a server.'
	});
	if (!guild) {
		return;
	}

	const guildMember = await resolveGuildMember({
		guild,
		discordUserId: interaction.user.id,
		responder,
		logger,
		logMessage: 'Failed to resolve member while handling division selection button',
		failureMessage: 'Could not resolve your member record. Please contact TECH with:',
		requestId: true
	});
	if (!guildMember) {
		return;
	}

	const isLegionnaire = await container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
		member: guildMember,
		requiredRoleKinds: [DivisionKind.LEGIONNAIRE]
	});

	logger.info(
		{
			discordMessageId: interaction.id,
			discordUserId: interaction.user.id,
			discordUsername: interaction.user.username,
			customButtonId: interaction.customId
		},
		'processing division button interaction'
	);

	const flowContext = createChildExecutionContext({
		context,
		bindings: {
			flowAction: parsedDivisionSelection.action === 'join' ? 'joinDivision' : 'leaveDivision'
		}
	});

	try {
		const result = await applyDivisionSelection(
			{
				listSelectableDivisions: () =>
					container.utilities.divisionCache.get({
						kinds: [DivisionKind.NAVY, DivisionKind.MARINES, DivisionKind.SUPPORT]
					}),
				memberHasRole: (roleId: string) => guildMember.roles.cache.has(roleId),
				removeRoles: (roleIds: string[], reason: string) => guildMember.roles.remove(roleIds, reason).then(() => undefined),
				addRole: (roleId: string, reason: string) => guildMember.roles.add(roleId, reason).then(() => undefined)
			},
			{
				action: parsedDivisionSelection.action,
				selectedDivisionCode: parsedDivisionSelection.code,
				isLegionnaire
			}
		);

		flowContext.logger.info(
			{
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId,
				result
			},
			'Processed division selection button'
		);

		await responder.safeEditReply({
			content: buildDivisionSelectionReply({
				result,
				requestId: context.requestId
			})
		});
	} catch (error: unknown) {
		flowContext.logger.error(
			{
				err: error,
				discordMessageId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId,
				action: parsedDivisionSelection.action
			},
			'Failed to process division selection button'
		);
		await responder.fail('There was an error processing your selection. Please contact a TECH member with the following:', {
			requestId: true
		});
	}
}
