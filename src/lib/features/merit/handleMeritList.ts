import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';

import { createInteractionResponder } from '../../discord/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../discord/interactionPreflight';
import type { ExecutionContext } from '../../logging/executionContext';
import { loadInitialMeritList, loadMeritListPage } from '../../services/merit-read/meritReadService';
import { buildMeritListPayload } from './buildMeritListPayload';
import { createMeritReadServiceDeps, mapGuildMemberToMeritReadMember } from './meritReadServiceAdapters';
import type { ParsedMeritListButton } from './parseMeritListButton';

type HandleMeritListParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

type HandleMeritListPageButtonParams = {
	interaction: ButtonInteraction;
	parsedMeritListButton: ParsedMeritListButton;
	context: ExecutionContext;
};

const MERIT_LIST_PAGE_SIZE = 5;

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

	let result: Awaited<ReturnType<typeof loadInitialMeritList>>;
	try {
		result = await loadInitialMeritList(createMeritReadServiceDeps({ guild }), {
			actor: requester.actor,
			requesterMember: mapGuildMemberToMeritReadMember(requester.member),
			requestedTargetDiscordUserId: interaction.options.getString('user_name')?.trim() ?? null,
			requestedPrivate: interaction.options.getBoolean('private'),
			pageSize: MERIT_LIST_PAGE_SIZE
		});
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to load initial merit list page'
		);
		await responder.fail('Failed to load merit summary. Please contact TECH with:', {
			requestId: true
		});
		return;
	}

	if (result.kind === 'forbidden_other_user') {
		await responder.fail('Only staff can list merits for another user.');
		return;
	}
	if (result.kind === 'target_not_found') {
		await responder.fail('Selected user was not found.');
		return;
	}

	await responder.deferReply(result.shouldReplyPrivately ? { flags: MessageFlags.Ephemeral } : undefined);
	await responder.safeEditReply(
		buildMeritListPayload({
			targetDiscordUserId: result.targetMember.discordUserId,
			targetDisplayName: result.targetMember.displayName,
			totalMerits: result.summary.totalMerits,
			totalLinkedEvents: result.summary.totalLinkedEvents,
			page: result.summary.page,
			totalPages: result.summary.totalPages,
			entries: result.summary.entries
		})
	);
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

	let result: Awaited<ReturnType<typeof loadMeritListPage>>;
	try {
		result = await loadMeritListPage(createMeritReadServiceDeps({ guild }), {
			targetDiscordUserId: parsedMeritListButton.targetDiscordUserId,
			page: parsedMeritListButton.page,
			pageSize: MERIT_LIST_PAGE_SIZE
		});
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to load merit list page'
		);
		await responder.fail('Failed to refresh merit summary. Please contact TECH with:', {
			requestId: true
		});
		return;
	}

	if (result.kind === 'target_not_found') {
		await responder.fail('Selected user was not found.');
		return;
	}

	await responder.safeEditReply(
		buildMeritListPayload({
			targetDiscordUserId: result.targetMember.discordUserId,
			targetDisplayName: result.targetMember.displayName,
			totalMerits: result.summary.totalMerits,
			totalLinkedEvents: result.summary.totalLinkedEvents,
			page: result.summary.page,
			totalPages: result.summary.totalPages,
			entries: result.summary.entries
		})
	);
}
