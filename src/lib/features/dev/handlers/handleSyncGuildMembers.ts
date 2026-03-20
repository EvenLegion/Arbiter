import type { Subcommand } from '@sapphire/plugin-subcommands';

import { prepareGuildInteraction } from '../../../discord/interactions/prepareGuildInteraction';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createGuildMemberSyncDeps } from '../../../services/guild-member-sync/createGuildMemberSyncDeps';
import { syncGuildMembers } from '../../../services/guild-member-sync/guildMemberSyncService';
import { buildGuildMemberSyncPayload } from '../presenters/buildGuildMemberSyncPayload';

type HandleSyncGuildMembersParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleSyncGuildMembers({ interaction, context }: HandleSyncGuildMembersParams) {
	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller: 'handleSyncGuildMembers',
		guildLogMessage: 'Failed to resolve configured guild for dev sync command',
		guildFailureMessage: 'This command can only be used in a guild.',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}

	const { guild, logger, responder } = prepared;

	try {
		const result = await syncGuildMembers(
			createGuildMemberSyncDeps({
				guild,
				context
			})
		);

		if (result.kind === 'division_cache_refresh_failed') {
			logger.error(result, 'guild_member.sync.failed');
			await responder.fail('Failed to refresh division cache.', {
				requestId: true
			});
			return;
		}
		if (result.kind === 'members_load_failed') {
			logger.error(result, 'guild_member.sync.failed');
			await responder.fail('Failed to load guild members.', {
				requestId: true
			});
			return;
		}

		if (result.failedMembers.length > 0) {
			logger.warn(result, 'guild_member.sync.completed_with_failures');
		} else {
			logger.info(result, 'guild_member.sync.completed');
		}
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
