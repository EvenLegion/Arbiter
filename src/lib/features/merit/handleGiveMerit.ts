import { type ChatInputCommandInteraction } from 'discord.js';
import { z } from 'zod';

import { createInteractionResponder } from '../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../discord/interactionPreflight';
import type { ExecutionContext } from '../../logging/executionContext';
import { awardManualMeritWorkflow } from '../../services/manual-merit/manualMeritService';
import { buildManualMeritAwardReply } from './buildManualMeritAwardReply';
import { createManualMeritWorkflowDeps, mapMemberToResolvedMember } from './manualMeritServiceAdapters';

type HandleGiveMeritParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();

export async function handleGiveMerit({ interaction, context }: HandleGiveMeritParams) {
	const caller = 'handleGiveMerit';
	const logger = context.logger.child({ caller });
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
		logMessage: 'Failed to resolve configured guild while handling manual merit award',
		failureMessage: 'Could not resolve configured guild. Please contact TECH with:',
		requestId: true
	});
	if (!guild) {
		return;
	}

	const rawPlayerDiscordUserId = interaction.options.getString('player_name', true);
	const rawMeritTypeCode = interaction.options.getString('merit_type', true);
	const reason = interaction.options.getString('reason')?.trim() ?? null;

	const rawEventSelection = interaction.options.getString('existing_event');
	const parsedEventSessionId = rawEventSelection ? EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSelection) : null;
	if (rawEventSelection && !parsedEventSessionId?.success) {
		await responder.safeEditReply({
			content: 'Invalid event selection. Please use the autocomplete options.'
		});
		return;
	}

	const awarder = await resolveInteractionActor({
		guild,
		discordUserId: interaction.user.id,
		responder,
		logger,
		logMessage: 'Failed to resolve awarder member while handling manual merit award',
		failureMessage: 'Could not resolve your member record. Please contact TECH with:',
		requestId: true,
		capabilityRequirement: 'staff',
		unauthorizedMessage: 'Only staff can use this command.'
	});
	if (!awarder) {
		return;
	}

	let result: Awaited<ReturnType<typeof awardManualMeritWorkflow>>;
	try {
		result = await awardManualMeritWorkflow(
			createManualMeritWorkflowDeps({
				guild,
				awarderMember: awarder.member,
				context,
				logger
			}),
			{
				actor: awarder.actor,
				actorMember: mapMemberToResolvedMember(awarder.member),
				playerInput: rawPlayerDiscordUserId,
				rawMeritTypeCode,
				reason,
				linkedEventSessionId: parsedEventSessionId?.success ? parsedEventSessionId.data : null
			}
		);
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to process manual merit award workflow'
		);
		await responder.fail('Failed to process manual merit award. Please contact TECH with:', {
			requestId: true
		});
		return;
	}

	if (result.kind === 'forbidden') {
		await responder.fail('Only staff can use this command.');
		return;
	}
	if (result.kind === 'invalid_player_selection') {
		await responder.safeEditReply({
			content: 'Invalid player selection. Please use the autocomplete options.'
		});
		return;
	}
	if (result.kind === 'invalid_merit_type') {
		await responder.safeEditReply({
			content: 'Invalid merit type. Please select one of the provided options.'
		});
		return;
	}
	if (result.kind === 'target_not_found') {
		await responder.safeEditReply({
			content: 'Selected player was not found. Please use the autocomplete options.'
		});
		return;
	}
	if (result.kind === 'awarder_not_found') {
		await responder.fail('Could not resolve your member record. Please contact TECH with:', {
			requestId: true
		});
		return;
	}
	if (result.kind === 'linked_event_not_found') {
		await responder.safeEditReply({
			content: 'Selected event was not found.'
		});
		return;
	}
	if (result.kind === 'linked_event_too_old') {
		await responder.safeEditReply({
			content: 'Selected event is older than 5 days and cannot be linked for this command.'
		});
		return;
	}
	if (result.kind === 'merit_type_not_manual_awardable') {
		await responder.safeEditReply({
			content: 'Selected merit type can only be awarded through event finalization.'
		});
		return;
	}

	await responder.safeEditReply({
		content: buildManualMeritAwardReply(result)
	});

	logger.info(
		{
			targetDiscordUserId: result.targetDiscordUserId,
			awarderDiscordUserId: interaction.user.id,
			amount: result.meritAmount,
			meritTypeCode: result.meritTypeCode,
			reason: result.reason,
			eventSessionId: parsedEventSessionId?.success ? parsedEventSessionId.data : null,
			meritRecordId: result.meritRecordId
		},
		'Processed manual merit award'
	);
}
