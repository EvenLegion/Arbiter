import { type ButtonInteraction } from 'discord.js';
import { DivisionKind } from '@prisma/client';

import { ENV_DISCORD } from '../../../../config/env/discord';
import { memberHasDivisionKindRole } from '../../../discord/guild/divisions';
import { listCachedDivisions } from '../../../discord/guild/divisions';
import { createInteractionResponder } from '../../../discord/interactions/interactionResponder';
import { resolveConfiguredGuild, resolveGuildMember } from '../../../discord/interactions/interactionPreflight';
import type { ExecutionContext } from '../../../logging/executionContext';
import { applyDivisionSelection, type DivisionSelectionResult } from '../../../services/division-selection/divisionSelectionService';
import type { ParsedDivisionSelection } from '../divisionSelectionCustomId';

type HandleDivisionSelectionButtonParams = {
	interaction: ButtonInteraction;
	parsedDivisionSelection: ParsedDivisionSelection;
	context: ExecutionContext;
};

export async function handleDivisionSelectionButton({ interaction, parsedDivisionSelection, context }: HandleDivisionSelectionButtonParams) {
	const caller = 'handleDivisionSelectionButton';
	const logger = context.logger.child({
		caller,
		divisionSelectionAction: parsedDivisionSelection.action,
		divisionCode: parsedDivisionSelection.code,
		flowAction: parsedDivisionSelection.action === 'join' ? 'joinDivision' : 'leaveDivision'
	});
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

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

	const isLegionnaire = await memberHasDivisionKindRole({
		member: guildMember,
		requiredRoleKinds: [DivisionKind.LEGIONNAIRE]
	});

	try {
		const result = await applyDivisionSelection(
			{
				listSelectableDivisions: () =>
					listCachedDivisions({
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

		logger.info(
			{
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				discordUsername: interaction.user.username,
				customButtonId: interaction.customId,
				result
			},
			'Processed division selection button'
		);

		await responder.safeEditReply({
			content: buildDivisionSelectionReplyMessage({
				result,
				requestId: context.requestId
			})
		});
	} catch (error: unknown) {
		logger.error(
			{
				err: error,
				discordInteractionId: interaction.id,
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

function buildDivisionSelectionReplyMessage({ result, requestId }: { result: DivisionSelectionResult; requestId: string }) {
	switch (result.kind) {
		case 'forbidden':
			return `Only <@&${ENV_DISCORD.LGN_ROLE_ID}> members can select a division. Please contact a TECH member with the following: requestId=${requestId}`;
		case 'division_not_found':
			return `There was an error processing your selection. Please contact a TECH member with the following: requestId=${requestId}`;
		case 'already_member':
			return `You are already a member of the ${result.divisionName} division.`;
		case 'no_membership':
			return 'You are not currently a member of any division.';
		case 'joined':
			return `You have joined the ${result.divisionName} division.`;
		case 'left':
			return 'Removed your division membership.';
	}
}
