import type { Subcommand } from '@sapphire/plugin-subcommands';

import { userRepository } from '../../../../integrations/prisma/repositories';
import { getGuildMember } from '../../../discord/guild/guildMembers';
import { prepareGuildInteraction } from '../../../discord/interactions/prepareGuildInteraction';
import { parseDiscordUserIdInput } from '../../../discord/members/memberDirectory';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createChildExecutionContext } from '../../../logging/executionContext';
import { createGuildNicknameWorkflow } from '../../../services/nickname/guildNicknameWorkflow';

type HandleStaffUpdateNicknameParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleStaffUpdateNickname({ interaction, context }: HandleStaffUpdateNicknameParams) {
	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller: 'handleStaffUpdateNickname',
		guildLogMessage: 'Failed to resolve configured guild for staff update_nickname command',
		guildFailureMessage: 'Failed to resolve guild for nickname update.',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}

	const { guild, logger, responder } = prepared;
	const rawExistingUserSelection = interaction.options.getString('existing_user', true);
	const newNickname = interaction.options.getString('new_nickname', true).trim();
	const targetDiscordUserId = parseDiscordUserIdInput(rawExistingUserSelection);

	if (!targetDiscordUserId) {
		await responder.safeEditReply({
			content: `Invalid \`existing_user\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
		});
		return;
	}

	try {
		const [targetUser, member] = await Promise.all([
			userRepository.get({
				discordUserId: targetDiscordUserId
			}),
			getGuildMember({
				guild,
				discordUserId: targetDiscordUserId,
				logger
			})
		]);

		if (!targetUser) {
			await responder.safeEditReply({
				content: `Selected user is not present in the User table. requestId=\`${context.requestId}\``
			});
			return;
		}

		if (!member) {
			await responder.safeEditReply({
				content: `Selected user is not present in the configured guild. requestId=\`${context.requestId}\``
			});
			return;
		}

		await userRepository.updateNickname({
			discordUserId: targetDiscordUserId,
			discordNickname: newNickname
		});

		const nicknames = createGuildNicknameWorkflow({
			guild,
			context: createChildExecutionContext({
				context,
				bindings: {
					targetDbUserId: targetUser.id,
					targetDiscordUserId,
					step: 'syncNicknameAfterStaffUpdateNickname'
				}
			}),
			includeStaff: true,
			resolveMember: async (discordUserId) => (discordUserId === member.id ? member : getGuildMember({ guild, discordUserId, logger }))
		});
		const nicknameSyncResult = await nicknames.syncNickname({
			discordUserId: targetDiscordUserId,
			setReason: 'Staff nickname update sync'
		});

		if (nicknameSyncResult.kind !== 'synced') {
			logger.warn(
				{
					targetDiscordUserId,
					targetDbUserId: targetUser.id,
					nicknameSyncKind: nicknameSyncResult.kind
				},
				'staff.update_nickname.nickname_sync_not_synced'
			);
			await responder.safeEditReply({
				content:
					`Updated the stored nickname for <@${targetDiscordUserId}> to \`${newNickname}\`, ` +
					`but nickname sync did not complete (\`${nicknameSyncResult.kind}\`). requestId=\`${context.requestId}\``
			});
			return;
		}

		logger.info(
			{
				targetDiscordUserId,
				targetDbUserId: targetUser.id,
				nicknameSyncOutcome: nicknameSyncResult.outcome
			},
			'staff.update_nickname.completed'
		);

		await responder.safeEditReply({
			content: `Updated the stored nickname for <@${targetDiscordUserId}> to \`${newNickname}\` and synced their Discord nickname. requestId=\`${context.requestId}\``
		});
	} catch (error: unknown) {
		logger.error(
			{
				err: error,
				targetDiscordUserId,
				requestId: context.requestId
			},
			'Unhandled error while running staff update_nickname command'
		);
		await responder.fail('Failed to update nickname due to an unexpected error.', {
			requestId: true
		});
	}
}
