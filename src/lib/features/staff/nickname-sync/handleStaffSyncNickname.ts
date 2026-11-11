import type { Subcommand } from '@sapphire/plugin-subcommands';

import { prepareGuildInteraction } from '../../../discord/interactions/prepareGuildInteraction';
import { parseDiscordUserIdInput } from '../../../discord/members/memberDirectory';
import type { ExecutionContext } from '../../../logging/executionContext';
import { syncBulkNicknames } from '../../../services/bulk-nickname/bulkNicknameService';
import { buildBulkNicknameSyncPayload } from './buildBulkNicknameSyncPayload';
import { createStaffBulkNicknameSyncDeps } from './createStaffBulkNicknameSyncDeps';

type HandleStaffSyncNicknameParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleStaffSyncNickname({ interaction, context }: HandleStaffSyncNicknameParams) {
	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller: 'handleStaffSyncNickname',
		guildLogMessage: 'Failed to resolve configured guild for staff nickname sync command',
		guildFailureMessage: 'Failed to resolve guild for nickname sync.',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}
	const { guild, logger, responder } = prepared;
	const dryRun = interaction.options.getBoolean('dry_run', false) ?? false;
	await responder.safeEditReply({
		content: `${dryRun ? 'Nickname sync dry run' : 'Nickname sync'} started. requestId=\`${context.requestId}\``
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

	try {
		const result = await syncBulkNicknames(
			createStaffBulkNicknameSyncDeps({
				guild,
				context
			}),
			{
				requestedDiscordUserId,
				includeStaff,
				dryRun
			}
		);

		if (result.kind === 'prepare_failed') {
			logger.error(result, 'nickname.sync.failed');
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

		// The dry-run plan holds nicknames: it goes only into the ephemeral reply. Logs get its size only.
		const { plan, ...counts } = result;
		const logBindings = {
			...counts,
			planRows: plan.length,
			includeStaff
		};
		const logEvent = dryRun ? 'nickname.sync.dry_run_completed' : 'nickname.sync.completed';
		if (result.failed > 0) {
			logger.warn(logBindings, `${logEvent}_with_failures`);
		} else {
			logger.info(logBindings, logEvent);
		}

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
