import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';

import { ENV_MERIT_BADGE_ROLES } from '../../../../config/env/discord';
import { meritRepository, type MeritRankBreakdownLadder } from '../../../../integrations/prisma/repositories';
import { createInteractionResponder } from '../../../discord/interactions/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../../discord/interactions/interactionPreflight';
import type { ExecutionContext } from '../../../logging/executionContext';
import { hasEveryMeritBadgeRole } from '../../../services/merit-rank/meritBadgeMessages';
import { buildMeritRankListPayload } from './buildMeritRankListPayload';
import type { ParsedMeritRankListButton } from './meritRankListButtonCustomId';

type HandleMeritRankListParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleMeritRankList({ interaction, context }: HandleMeritRankListParams) {
	const caller = 'handleMeritRankList';
	const logger = context.logger.child({ caller });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});
	const shouldReplyPublicly = interaction.options.getBoolean('public') ?? false;

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild while handling merit rank list command',
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
		logMessage: 'Failed to resolve requester member for merit rank list command',
		failureMessage: 'Could not resolve your member record. Please contact TECH with:',
		requestId: true,
		capabilityRequirement: 'staff',
		unauthorizedMessage: 'Only staff can use this command.'
	});
	if (!requester) {
		return;
	}

	await responder.deferReply(
		shouldReplyPublicly
			? undefined
			: {
					flags: MessageFlags.Ephemeral
				}
	);

	try {
		const ladder = resolveRankListLadder();
		const entries = await meritRepository.getMeritRankBreakdown({ ladder });

		logger.info(
			{
				shouldReplyPublicly,
				ladder,
				rankedLevelCount: entries.length
			},
			'merit.rank_list.loaded'
		);

		await responder.safeEditReply(
			buildMeritRankListPayload({
				entries,
				page: 1,
				ladder
			})
		);
	} catch (error) {
		logger.error(
			{
				err: error,
				shouldReplyPublicly
			},
			'Failed to load merit rank list'
		);
		await responder.fail('Failed to load merit rank list. Please contact TECH with:', {
			requestId: true
		});
	}
}

type HandleMeritRankListPageButtonParams = {
	interaction: ButtonInteraction;
	parsedMeritRankListButton: ParsedMeritRankListButton;
	context: ExecutionContext;
};

export async function handleMeritRankListPageButton({ interaction, parsedMeritRankListButton, context }: HandleMeritRankListPageButtonParams) {
	const caller = 'handleMeritRankListPageButton';
	const logger = context.logger.child({
		caller,
		page: parsedMeritRankListButton.page
	});
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
		logMessage: 'Failed to resolve configured guild for merit rank list pagination',
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
		logMessage: 'Failed to resolve requester member for merit rank list pagination',
		failureMessage: 'Could not resolve your member record. Please contact TECH with:',
		requestId: true,
		capabilityRequirement: 'staff',
		unauthorizedMessage: 'Only staff can use this command.'
	});
	if (!requester) {
		return;
	}

	await responder.deferUpdate();

	try {
		const ladder = resolveRankListLadder();
		const entries = await meritRepository.getMeritRankBreakdown({ ladder });

		// A page past the end, such as page 5 from a legacy list, clamps to the last page.
		await responder.safeEditReply(
			buildMeritRankListPayload({
				entries,
				page: parsedMeritRankListButton.page,
				ladder
			})
		);
	} catch (error) {
		logger.error(
			{
				err: error,
				page: parsedMeritRankListButton.page
			},
			'Failed to load merit rank list page'
		);
		await responder.fail('Failed to refresh merit rank list. Please contact TECH with:', {
			requestId: true
		});
	}
}

/** Badge tiers once every badge role is configured; otherwise the legacy 50-level breakdown. */
function resolveRankListLadder(): MeritRankBreakdownLadder {
	return hasEveryMeritBadgeRole(ENV_MERIT_BADGE_ROLES) ? 'badge' : 'legacy';
}
