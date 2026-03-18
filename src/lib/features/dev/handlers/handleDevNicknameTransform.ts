import type { Subcommand } from '@sapphire/plugin-subcommands';

import { parseDiscordUserIdInput } from '../../../discord/members/memberDirectory';
import type { ExecutionContext } from '../../../logging/executionContext';
import { transformBulkNicknames } from '../../../services/bulk-nickname/bulkNicknameService';
import { createBulkNicknameTransformDeps } from '../../../services/bulk-nickname/createBulkNicknameTransformDeps';
import { type NicknameTransformMode } from '../../../services/bulk-nickname/nicknameTransform';
import { buildBulkNicknameTransformPayload } from '../presenters/buildBulkNicknameTransformPayload';
import { prepareDevGuildCommand } from './prepareDevGuildCommand';

type HandleDevNicknameTransformParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
	mode: NicknameTransformMode;
};

export async function handleDevNicknameTransform({ interaction, context, mode }: HandleDevNicknameTransformParams) {
	const caller = 'handleDevNicknameTransform';
	const prepared = await prepareDevGuildCommand({
		interaction,
		context,
		caller,
		loggerBindings: {
			mode
		},
		guildLogMessage: 'Failed to resolve configured guild for dev nickname command',
		guildFailureMessage: 'Failed to resolve guild for dev nickname command.'
	});
	if (!prepared) {
		return;
	}

	const { guild, logger, responder } = prepared;

	await responder.safeEditReply({
		content: `Nickname ${mode} started. requestId=\`${context.requestId}\``
	});

	const optionValue = interaction.options.getString('user', false);
	const requestedDiscordUserId = parseDiscordUserIdInput(optionValue);
	if (optionValue && !requestedDiscordUserId) {
		await responder.safeEditReply({
			content: `Invalid \`user\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
		});
		return;
	}

	try {
		const result = await transformBulkNicknames(
			createBulkNicknameTransformDeps({
				guild
			}),
			{
				requestedDiscordUserId,
				mode
			}
		);

		if (result.kind === 'no_targets') {
			await responder.safeEditReply({
				content: requestedDiscordUserId
					? `Selected user is not in User table. requestId=\`${context.requestId}\``
					: `No users found in User table. requestId=\`${context.requestId}\``
			});
			return;
		}

		if (result.failed > 0) {
			logger.warn(result, 'nickname.transform.completed_with_failures');
		} else {
			logger.info(result, 'nickname.transform.completed');
		}

		await responder.safeEditReply(
			buildBulkNicknameTransformPayload({
				result,
				requestId: context.requestId
			})
		);
	} catch (error: unknown) {
		logger.error(
			{
				err: error,
				requestId: context.requestId,
				mode
			},
			'Unhandled error while running dev nickname command'
		);
		await responder.fail('Failed to complete dev nickname command due to an unexpected error.', {
			requestId: true
		});
	}
}
