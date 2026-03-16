import type { Subcommand } from '@sapphire/plugin-subcommands';

import { createInteractionResponder } from '../../discord/interactionResponder';
import { resolveConfiguredGuild } from '../../discord/interactionPreflight';
import { parseDiscordUserIdInput } from '../../discord/memberDirectory';
import type { ExecutionContext } from '../../logging/executionContext';
import { transformBulkNicknames } from '../../services/bulk-nickname/bulkNicknameService';
import { type NicknameTransformMode } from './nicknameTransform';
import { buildBulkNicknameTransformPayload } from './buildBulkNicknameTransformPayload';
import { createDevBulkNicknameTransformDeps } from './bulkNicknameServiceAdapters';

type HandleDevNicknameTransformParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
	mode: NicknameTransformMode;
};

export async function handleDevNicknameTransform({ interaction, context, mode }: HandleDevNicknameTransformParams) {
	const caller = 'handleDevNicknameTransform';
	const logger = context.logger.child({ caller, mode });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	await responder.deferEphemeralReply();
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

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild for dev nickname command',
		failureMessage: 'Failed to resolve guild for dev nickname command.',
		requestId: true
	});
	if (!guild) {
		return;
	}

	try {
		const result = await transformBulkNicknames(
			createDevBulkNicknameTransformDeps({
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

		logger.info(result, 'Completed dev nickname command');

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
