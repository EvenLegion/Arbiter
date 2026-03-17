import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';

import { createInteractionResponder } from '../../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../../discord/interactionPreflight';
import type { ExecutionContext } from '../../../logging/executionContext';
import type { ParsedMeritListButton } from '../parseMeritListButton';
import { loadInitialMeritListView, loadMeritListPageView } from './meritListController';

type HandleMeritListParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

type HandleMeritListPageButtonParams = {
	interaction: ButtonInteraction;
	parsedMeritListButton: ParsedMeritListButton;
	context: ExecutionContext;
};

export async function handleMeritList({ interaction, context }: HandleMeritListParams) {
	const caller = 'handleMeritList';
	const logger = context.logger.child({ caller });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild while handling merit list command',
		failureMessage: 'Could not resolve configured guild. Please contact TECH with:',
		requestId: true
	});
	if (!guild) {
		return;
	}

	const requester = await resolveInteractionActor({
		guild,
		discordUserId: interaction.user.id,
		responder,
		logger,
		logMessage: 'Failed to resolve requester member for merit list command',
		failureMessage: 'Could not resolve your member record. Please contact TECH with:',
		requestId: true
	});
	if (!requester) {
		return;
	}

	const response = await loadInitialMeritListView({
		guild,
		actor: requester.actor,
		requesterMember: requester.member,
		requestedTargetDiscordUserId: interaction.options.getString('user_name')?.trim() ?? null,
		requestedPrivate: interaction.options.getBoolean('private'),
		logger
	});
	if (response.delivery === 'fail') {
		await responder.fail(response.content, {
			requestId: response.requestId
		});
		return;
	}

	await responder.deferReply(response.flags ? { flags: response.flags } : undefined);
	await responder.safeEditReply(response.payload);
}

export async function handleMeritListPageButton({ interaction, parsedMeritListButton, context }: HandleMeritListPageButtonParams) {
	const caller = 'handleMeritListPageButton';
	const logger = context.logger.child({
		caller,
		targetDiscordUserId: parsedMeritListButton.targetDiscordUserId,
		page: parsedMeritListButton.page
	});
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	await responder.deferUpdate();

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild for merit list pagination',
		failureMessage: 'Could not resolve configured guild. Please contact TECH with:',
		requestId: true
	});
	if (!guild) {
		return;
	}

	const response = await loadMeritListPageView({
		guild,
		targetDiscordUserId: parsedMeritListButton.targetDiscordUserId,
		page: parsedMeritListButton.page,
		logger
	});
	if (response.delivery === 'fail') {
		await responder.fail(response.content, {
			requestId: response.requestId
		});
		return;
	}

	await responder.safeEditReply(response.payload);
}
