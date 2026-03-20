import type { Subcommand } from '@sapphire/plugin-subcommands';

import { prepareGuildInteraction } from '../../../discord/interactions/prepareGuildInteraction';
import { parseDiscordUserIdInput } from '../../../discord/members/memberDirectory';
import type { ExecutionContext } from '../../../logging/executionContext';
import { applyDivisionMembershipMutation } from '../../../services/division-membership/divisionMembershipService';
import { buildDivisionMembershipMutationReply } from './buildDivisionMembershipMutationReply';
import { createDivisionMembershipMutationRuntime } from './divisionMembershipMutationRuntime';

type HandleDivisionMembershipCommandParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
	mode: 'add' | 'remove';
};

export async function handleDivisionMembershipCommand({ interaction, context, mode }: HandleDivisionMembershipCommandParams) {
	const caller = 'handleDivisionMembershipCommand';
	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller,
		loggerBindings: {
			mode
		},
		guildLogMessage: 'Failed to resolve configured guild for staff division membership command',
		guildFailureMessage: 'Failed to resolve guild for division membership update.',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}
	const { guild, logger, responder } = prepared;

	const requestedDiscordUserId = parseDiscordUserIdInput(interaction.options.getString('nickname', true));
	if (!requestedDiscordUserId) {
		await responder.safeEditReply({
			content: `Invalid \`nickname\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
		});
		return;
	}

	try {
		const result = await applyDivisionMembershipMutation(
			createDivisionMembershipMutationRuntime({
				guild,
				context
			}),
			{
				mode,
				targetDiscordUserId: requestedDiscordUserId,
				divisionSelection: interaction.options.getString('division_name', true).trim(),
				syncNickname: interaction.options.getBoolean('sync_nickname', false) ?? true
			}
		);

		const logBindings = {
			...result,
			mode
		};
		if (result.kind === 'updated') {
			if (
				result.nicknameSync.kind === 'failed' ||
				result.nicknameSync.kind === 'guild-unavailable' ||
				result.nicknameSync.kind === 'member-not-found'
			) {
				logger.warn(logBindings, 'division.membership.updated_with_nickname_sync_issue');
			} else {
				logger.info(logBindings, 'division.membership.updated');
			}
		} else {
			logger.info(logBindings, 'division.membership.rejected');
		}
		await responder.safeEditReply({
			content: buildDivisionMembershipMutationReply({
				result,
				requestId: context.requestId
			})
		});
	} catch (error: unknown) {
		logger.error(
			{
				err: error,
				requestId: context.requestId
			},
			'Unhandled error while running staff division membership command'
		);
		await responder.fail('Failed to update division membership due to an unexpected error.', {
			requestId: true
		});
	}
}
