import type { Subcommand } from '@sapphire/plugin-subcommands';

import { createInteractionResponder } from '../../discord/interactionResponder';
import { parseDiscordUserIdInput } from '../../discord/memberDirectory';
import type { ExecutionContext } from '../../logging/executionContext';
import { applyDivisionMembershipMutation } from '../../services/division-membership/divisionMembershipService';
import { buildDivisionMembershipMutationReply } from './buildDivisionMembershipMutationReply';
import { createDivisionMembershipMutationDeps } from './divisionMembershipServiceAdapters';

type HandleDivisionMembershipCommandParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
	mode: 'add' | 'remove';
};

export async function handleDivisionMembershipCommand({ interaction, context, mode }: HandleDivisionMembershipCommandParams) {
	const caller = 'handleDivisionMembershipCommand';
	const logger = context.logger.child({ caller, mode });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	await responder.deferEphemeralReply();

	const requestedDiscordUserId = parseDiscordUserIdInput(interaction.options.getString('nickname', true));
	if (!requestedDiscordUserId) {
		await responder.safeEditReply({
			content: `Invalid \`nickname\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
		});
		return;
	}

	try {
		const result = await applyDivisionMembershipMutation(
			createDivisionMembershipMutationDeps({
				context
			}),
			{
				mode,
				targetDiscordUserId: requestedDiscordUserId,
				divisionSelection: interaction.options.getString('division_name', true).trim(),
				syncNickname: interaction.options.getBoolean('sync_nickname', false) ?? true
			}
		);

		logger.info(result, mode === 'add' ? 'Added division membership from staff command' : 'Removed division membership from staff command');
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
