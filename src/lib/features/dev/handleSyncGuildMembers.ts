import type { Subcommand } from '@sapphire/plugin-subcommands';

import { createInteractionResponder } from '../../discord/interactionResponder';
import { resolveConfiguredGuild } from '../../discord/interactionPreflight';
import type { ExecutionContext } from '../../logging/executionContext';
import { syncGuildMembers } from '../../services/guild-member-sync/guildMemberSyncService';
import { buildGuildMemberSyncPayload } from './buildGuildMemberSyncPayload';
import { createGuildMemberSyncDeps } from './guildMemberSyncServiceAdapters';

type HandleSyncGuildMembersParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleSyncGuildMembers({ interaction, context }: HandleSyncGuildMembersParams) {
	const logger = context.logger.child({ caller: 'handleSyncGuildMembers' });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller: 'handleSyncGuildMembers'
	});

	await responder.deferEphemeralReply();

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild for dev sync command',
		failureMessage: 'This command can only be used in a guild.',
		requestId: true
	});
	if (!guild) {
		return;
	}

	try {
		const result = await syncGuildMembers(
			createGuildMemberSyncDeps({
				guild,
				context
			})
		);

		if (result.kind === 'division_cache_refresh_failed') {
			await responder.fail('Failed to refresh division cache.', {
				requestId: true
			});
			return;
		}
		if (result.kind === 'members_load_failed') {
			await responder.fail('Failed to load guild members.', {
				requestId: true
			});
			return;
		}

		logger.info(result, 'guild_member.sync.completed');
		await responder.safeEditReply(buildGuildMemberSyncPayload({ result }));
	} catch (error: unknown) {
		logger.error(
			{
				err: error,
				requestId: context.requestId
			},
			'Unhandled error while running dev sync_guild_members command'
		);
		await responder.fail('Failed to complete dev sync command due to an unexpected error.', {
			requestId: true
		});
	}
}
