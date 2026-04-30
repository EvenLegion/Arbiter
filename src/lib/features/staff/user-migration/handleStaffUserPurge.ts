import type { Subcommand } from '@sapphire/plugin-subcommands';

import { userMigrationRepository, type UserReferenceCounts } from '../../../../integrations/prisma/repositories';
import { prepareGuildInteraction } from '../../../discord/interactions/prepareGuildInteraction';
import { parseDiscordUserIdInput } from '../../../discord/members/memberDirectory';
import type { ExecutionContext } from '../../../logging/executionContext';

type HandleStaffUserPurgeParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleStaffUserPurge({ interaction, context }: HandleStaffUserPurgeParams) {
	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller: 'handleStaffUserPurge',
		guildLogMessage: 'Failed to resolve configured guild for staff user_purge command',
		guildFailureMessage: 'Failed to resolve guild for user purge.',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}

	const { logger, responder } = prepared;
	const userIdInput = interaction.options.getString('user_id', true);
	const discordUserId = parseDiscordUserIdInput(userIdInput);
	if (!discordUserId) {
		await responder.safeEditReply({
			content: `Invalid \`user_id\` value. Provide a Discord user ID or mention. requestId=\`${context.requestId}\``
		});
		return;
	}

	try {
		const purgeResult = await userMigrationRepository.purgeByDiscordUserId({
			discordUserId
		});

		if (purgeResult.kind === 'user_not_found') {
			await responder.safeEditReply({
				content: `User is not present in the User table. requestId=\`${context.requestId}\``
			});
			return;
		}

		if (purgeResult.kind === 'references_remaining') {
			await responder.safeEditReply({
				content: buildUserPurgeBlockedReply({
					discordUserId,
					referenceCounts: purgeResult.referenceCounts,
					requestId: context.requestId
				})
			});
			return;
		}

		logger.info(
			{
				discordUserId,
				dbUserId: purgeResult.user.dbUserId
			},
			'staff.user_purge.completed'
		);

		await responder.safeEditReply({
			content: `Deleted the old user row for <@${discordUserId}> after confirming no references remained. requestId=\`${context.requestId}\``
		});
	} catch (error: unknown) {
		logger.error(
			{
				err: error,
				discordUserId,
				requestId: context.requestId
			},
			'Unhandled error while running staff user_purge command'
		);
		await responder.fail('Failed to purge user due to an unexpected error.', {
			requestId: true
		});
	}
}

function buildUserPurgeBlockedReply({
	discordUserId,
	referenceCounts,
	requestId
}: {
	discordUserId: string;
	referenceCounts: UserReferenceCounts;
	requestId: string;
}) {
	return [
		`Cannot purge <@${discordUserId}> because user-linked records still remain.`,
		`Division memberships: ${referenceCounts.divisionMemberships}`,
		`Name change requests: requester ${referenceCounts.nameChangeRequestsRequested}, reviewer ${referenceCounts.nameChangeRequestsReviewed}`,
		`Merits: received ${referenceCounts.meritsReceived}, awarded ${referenceCounts.meritsAwarded}`,
		`Events/channels: hosted ${referenceCounts.hostedEvents}, finalized ${referenceCounts.finalizedEvents}, channels ${referenceCounts.eventChannelsAdded}`,
		`Event participation/review: participant stats ${referenceCounts.participantStats}, review decisions ${referenceCounts.reviewDecisions}`,
		`requestId=\`${requestId}\``
	].join('\n');
}
