import type { Subcommand } from '@sapphire/plugin-subcommands';

import { divisionRepository, userRepository } from '../../../../integrations/prisma/repositories';
import { ENV_DISCORD } from '../../../../config/env';
import { getGuildMember } from '../../../discord/guild/guildMembers';
import { prepareGuildInteraction } from '../../../discord/interactions/prepareGuildInteraction';
import { parseDiscordUserIdInput } from '../../../discord/members/memberDirectory';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createChildExecutionContext } from '../../../logging/executionContext';
import { createGuildNicknameWorkflow } from '../../../services/nickname/guildNicknameWorkflow';

type HandleStaffOrgAcceptParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleStaffOrgAccept({ interaction, context }: HandleStaffOrgAcceptParams) {
	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller: 'handleStaffOrgAccept',
		guildLogMessage: 'Failed to resolve configured guild for staff org_accept command',
		guildFailureMessage: 'Failed to resolve guild for org accept.',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}

	const { guild, logger, responder } = prepared;
	const rawUserIdSelection = interaction.options.getString('user_id', false);
	const rawUserNameSelection = interaction.options.getString('user_name', false);
	const starCitizenUsername = interaction.options.getString('star_citizen_username', true).trim();
	const userIdFromSelection = parseDiscordUserIdInput(rawUserIdSelection);
	const userIdFromAutocomplete = parseDiscordUserIdInput(rawUserNameSelection);

	if (rawUserIdSelection && !userIdFromSelection) {
		await responder.safeEditReply({
			content: `Invalid \`user_id\` value. Provide a Discord user ID or mention. requestId=\`${context.requestId}\``
		});
		return;
	}

	if (rawUserNameSelection && !userIdFromAutocomplete) {
		await responder.safeEditReply({
			content: `Invalid \`user_name\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
		});
		return;
	}

	if (!userIdFromSelection && !userIdFromAutocomplete) {
		await responder.safeEditReply({
			content: `You must provide either \`user_id\` or \`user_name\`. requestId=\`${context.requestId}\``
		});
		return;
	}

	if (userIdFromSelection && userIdFromAutocomplete && userIdFromSelection !== userIdFromAutocomplete) {
		await responder.safeEditReply({
			content:
				`Provided \`user_id\` and \`user_name\` values mismatched. ` +
				`Provide matching values or only one. requestId=\`${context.requestId}\``
		});
		return;
	}

	const targetDiscordUserId = userIdFromSelection ?? userIdFromAutocomplete!;

	try {
		const [targetUser, intDivision, member] = await Promise.all([
			userRepository.get({
				discordUserId: targetDiscordUserId
			}),
			divisionRepository
				.listDivisions({
					codes: ['INT']
				})
				.then((divisions) => divisions[0] ?? null),
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

		if (!intDivision) {
			logger.error(
				{
					targetDiscordUserId,
					requestId: context.requestId
				},
				'INT division is missing while handling staff org_accept command'
			);
			await responder.fail('INT division is not configured in the database.', {
				requestId: true
			});
			return;
		}

		if (!intDivision.discordRoleId) {
			logger.error(
				{
					targetDiscordUserId,
					intDivisionId: intDivision.id,
					requestId: context.requestId
				},
				'INT division is missing discordRoleId while handling staff org_accept command'
			);
			await responder.fail('INT division is missing a configured Discord role in the database.', {
				requestId: true
			});
			return;
		}

		const alreadyHasIntRole = member.roles.cache.has(intDivision.discordRoleId);
		if (!alreadyHasIntRole) {
			await member.roles.add(intDivision.discordRoleId, 'Accepted into the org via /staff org_accept');
		}

		await Promise.all([
			userRepository.updateNickname({
				discordUserId: targetDiscordUserId,
				discordNickname: starCitizenUsername
			}),
			divisionRepository.addMemberships({
				userId: targetUser.id,
				divisionIds: [intDivision.id]
			})
		]);

		const nicknames = createGuildNicknameWorkflow({
			guild,
			context: createChildExecutionContext({
				context,
				bindings: {
					targetDbUserId: targetUser.id,
					targetDiscordUserId,
					step: 'syncNicknameAfterStaffOrgAccept'
				}
			}),
			includeStaff: true,
			resolveMember: async (discordUserId) => (discordUserId === member.id ? member : getGuildMember({ guild, discordUserId, logger }))
		});
		const nicknameSyncResult = await nicknames.syncNickname({
			discordUserId: targetDiscordUserId,
			setReason: 'Staff org accept nickname sync'
		});

		if (nicknameSyncResult.kind !== 'synced') {
			logger.warn(
				{
					targetDiscordUserId,
					targetDbUserId: targetUser.id,
					nicknameSyncKind: nicknameSyncResult.kind
				},
				'staff.org_accept.nickname_sync_not_synced'
			);
			await responder.safeEditReply({
				content:
					`Ensured INT membership and updated the stored nickname for <@${targetDiscordUserId}>, ` +
					`but nickname sync did not complete (\`${nicknameSyncResult.kind}\`). requestId=\`${context.requestId}\``
			});
			return;
		}

		logger.info(
			{
				targetDiscordUserId,
				targetDbUserId: targetUser.id,
				intRoleApplied: !alreadyHasIntRole,
				nicknameSyncOutcome: nicknameSyncResult.outcome
			},
			'staff.org_accept.completed'
		);

		await responder.safeEditReply({
			content:
				`Accepted <@${targetDiscordUserId}> into the org, stored \`${starCitizenUsername}\` as their base nickname, ` +
				`and synced their Discord nickname. requestId=\`${context.requestId}\``
		});
	} catch (error: unknown) {
		logger.error(
			{
				err: error,
				targetDiscordUserId,
				requestId: context.requestId
			},
			'Unhandled error while running staff org_accept command'
		);
		await responder.fail('Failed to complete org accept due to an unexpected error.', {
			requestId: true
		});
	}
}
