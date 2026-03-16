import type { Subcommand } from '@sapphire/plugin-subcommands';

import { createInteractionResponder } from '../../discord/interactionResponder';
import { resolveConfiguredGuild } from '../../discord/interactionPreflight';
import { parseDiscordUserIdInput } from '../../discord/memberDirectory';
import type { ExecutionContext } from '../../logging/executionContext';
import { syncBulkNicknames } from '../../services/bulk-nickname/bulkNicknameService';
import { buildBulkNicknameSyncPayload } from './buildBulkNicknameSyncPayload';
import { createStaffBulkNicknameSyncDeps } from './bulkNicknameServiceAdapters';

type HandleStaffSyncNicknameParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleStaffSyncNickname({ interaction, context }: HandleStaffSyncNicknameParams) {
	const logger = context.logger.child({ caller: 'handleStaffSyncNickname' });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller: 'handleStaffSyncNickname'
	});

	await responder.deferEphemeralReply();
	await responder.safeEditReply({
		content: `Nickname sync started. requestId=\`${context.requestId}\``
	});

	const optionValue = interaction.options.getString('user', false);
	const requestedDiscordUserId = parseDiscordUserIdInput(optionValue);
	const includeStaff = interaction.options.getBoolean('include_staff', false) ?? false;
	if (optionValue && !requestedDiscordUserId) {
		await responder.safeEditReply({
			content: `Invalid \`user\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
		});
		return;
	}

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild for staff nickname sync command',
		failureMessage: 'Failed to resolve guild for nickname sync.',
		requestId: true
	});
	if (!guild) {
		return;
	}

	try {
		const result = await syncBulkNicknames(
			createStaffBulkNicknameSyncDeps({
				guild,
				context
			}),
			{
				requestedDiscordUserId,
				includeStaff
			}
		);

		if (result.kind === 'prepare_failed') {
			await responder.fail('Failed to refresh division cache.', {
				requestId: true
			});
			return;
		}
		if (result.kind === 'no_targets') {
			await responder.safeEditReply({
				content: requestedDiscordUserId
					? `Selected user is not present in the User table. requestId=\`${context.requestId}\``
					: `No users found in the User table. requestId=\`${context.requestId}\``
			});
			return;
		}

		logger.info(
			{
				...result,
				includeStaff
			},
			'Completed staff nickname sync'
		);

		await responder.safeEditReply(
			buildBulkNicknameSyncPayload({
				result,
				includeStaff,
				requestId: context.requestId
			})
		);
	} catch (error: unknown) {
		logger.error(
			{
				err: error,
				requestId: context.requestId
			},
			'Unhandled error while running staff nickname sync command'
		);
		await responder.fail('Failed to complete nickname sync due to an unexpected error.', {
			requestId: true
		});
	}
}
