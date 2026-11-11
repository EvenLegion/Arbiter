import type { Subcommand } from '@sapphire/plugin-subcommands';
import type { Guild } from 'discord.js';

import { ENV_MERIT_BADGE_ROLES } from '../../../../config/env/discord';
import { userMigrationRepository, type MigrationCounts } from '../../../../integrations/prisma/repositories';
import { getGuildMember } from '../../../discord/guild/guildMembers';
import { prepareGuildInteraction } from '../../../discord/interactions/prepareGuildInteraction';
import { parseDiscordUserIdInput } from '../../../discord/members/memberDirectory';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createChildExecutionContext } from '../../../logging/executionContext';
import { createMeritBadgeSyncRuntime } from '../../../services/merit-badge/createMeritBadgeSyncRuntime';
import type { MeritBadgeSyncResult } from '../../../services/merit-badge/meritBadgeSyncService';
import { createGuildNicknameWorkflow } from '../../../services/nickname/guildNicknameWorkflow';

type HandleStaffUserMigrateParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleStaffUserMigrate({ interaction, context }: HandleStaffUserMigrateParams) {
	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller: 'handleStaffUserMigrate',
		guildLogMessage: 'Failed to resolve configured guild for staff user_migrate command',
		guildFailureMessage: 'Failed to resolve guild for user migration.',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}

	const { guild, logger, responder } = prepared;
	const oldUserIdInput = interaction.options.getString('old_user_id', true);
	const newUserIdInput = interaction.options.getString('new_user_id', true);
	const oldDiscordUserId = parseDiscordUserIdInput(oldUserIdInput);
	const newDiscordUserId = parseDiscordUserIdInput(newUserIdInput);

	if (!oldDiscordUserId) {
		await responder.safeEditReply({
			content: `Invalid \`old_user_id\` value. Provide a Discord user ID or mention. requestId=\`${context.requestId}\``
		});
		return;
	}

	if (!newDiscordUserId) {
		await responder.safeEditReply({
			content: `Invalid \`new_user_id\` value. Provide a Discord user ID or mention. requestId=\`${context.requestId}\``
		});
		return;
	}

	if (oldDiscordUserId === newDiscordUserId) {
		await responder.safeEditReply({
			content: `\`old_user_id\` and \`new_user_id\` must be different users. requestId=\`${context.requestId}\``
		});
		return;
	}

	try {
		const migrationResult = await userMigrationRepository.migrateByDiscordUserId({
			oldDiscordUserId,
			newDiscordUserId
		});

		if (migrationResult.kind === 'old_user_not_found') {
			await responder.safeEditReply({
				content: `Old user is not present in the User table. requestId=\`${context.requestId}\``
			});
			return;
		}

		if (migrationResult.kind === 'new_user_not_found') {
			await responder.safeEditReply({
				content: `New user is not present in the User table. requestId=\`${context.requestId}\``
			});
			return;
		}

		if (migrationResult.kind === 'same_user') {
			await responder.safeEditReply({
				content: `\`old_user_id\` and \`new_user_id\` must be different users. requestId=\`${context.requestId}\``
			});
			return;
		}

		const [oldMember, newMember] = await Promise.all([
			getGuildMember({
				guild,
				discordUserId: oldDiscordUserId,
				logger
			}),
			getGuildMember({
				guild,
				discordUserId: newDiscordUserId,
				logger
			})
		]);

		const roleCopyLine = await copyRolesFromOldMemberToNewMember({
			guild,
			oldMember,
			newMember,
			oldDiscordUserId,
			newDiscordUserId,
			badgeRoleIds: ENV_MERIT_BADGE_ROLES.roleIds,
			logger
		});

		const badgeSyncLine = await syncMeritBadgesAfterMigration({
			guild,
			context,
			oldDiscordUserId,
			newDiscordUserId,
			logger
		});

		let nicknameSyncLine = 'Nickname sync skipped because the new user is not present in the configured guild.';
		if (newMember) {
			const nicknames = createGuildNicknameWorkflow({
				guild,
				context: createChildExecutionContext({
					context,
					bindings: {
						oldDbUserId: migrationResult.oldUser.dbUserId,
						newDbUserId: migrationResult.newUser.dbUserId,
						oldDiscordUserId,
						newDiscordUserId,
						step: 'syncNicknameAfterStaffUserMigrate'
					}
				}),
				includeStaff: true,
				resolveMember: async (discordUserId) =>
					discordUserId === newMember.id ? newMember : getGuildMember({ guild, discordUserId, logger })
			});
			const nicknameSyncResult = await nicknames.syncNickname({
				discordUserId: newDiscordUserId,
				setReason: 'Staff user migration nickname sync'
			});
			nicknameSyncLine =
				nicknameSyncResult.kind === 'synced'
					? `Nickname sync: ${nicknameSyncResult.outcome}.`
					: `Nickname sync could not complete (\`${nicknameSyncResult.kind}\`).`;
		}

		logger.info(
			{
				oldDiscordUserId,
				newDiscordUserId,
				counts: migrationResult.counts
			},
			'staff.user_migrate.completed'
		);

		await responder.safeEditReply({
			content: buildUserMigrateReply({
				oldDiscordUserId,
				newDiscordUserId,
				counts: migrationResult.counts,
				roleCopyLine,
				badgeSyncLine,
				nicknameSyncLine,
				requestId: context.requestId
			})
		});
	} catch (error: unknown) {
		logger.error(
			{
				err: error,
				oldDiscordUserId,
				newDiscordUserId,
				requestId: context.requestId
			},
			'Unhandled error while running staff user_migrate command'
		);
		await responder.fail('Failed to complete user migration due to an unexpected error.', {
			requestId: true
		});
	}
}

function buildUserMigrateReply({
	oldDiscordUserId,
	newDiscordUserId,
	counts,
	roleCopyLine,
	badgeSyncLine,
	nicknameSyncLine,
	requestId
}: {
	oldDiscordUserId: string;
	newDiscordUserId: string;
	counts: MigrationCounts;
	roleCopyLine: string;
	badgeSyncLine: string | null;
	nicknameSyncLine: string;
	requestId: string;
}) {
	return [
		`Migrated records from <@${oldDiscordUserId}> to <@${newDiscordUserId}>.`,
		`Base nickname copied: ${counts.baseNicknameCopied ? 'yes' : 'no'}.`,
		`Division memberships: reassigned ${counts.divisionMembershipsReassigned}, merged ${counts.divisionMembershipsMerged}.`,
		`Participant stats: reassigned ${counts.participantStatsReassigned}, merged ${counts.participantStatsMerged}.`,
		`Review decisions: reassigned ${counts.reviewDecisionsReassigned}, merged ${counts.reviewDecisionsMerged}.`,
		`Merits: received ${counts.meritsReceivedMigrated}, awarded ${counts.meritsAwardedMigrated}.`,
		`Events/channels: hosted ${counts.hostedEventsMigrated}, finalized ${counts.finalizedEventsMigrated}, channels ${counts.eventChannelsMigrated}.`,
		`Name change requests: requester ${counts.requestedNameChangesMigrated}, reviewer ${counts.reviewedNameChangesMigrated}.`,
		roleCopyLine,
		...(badgeSyncLine ? [badgeSyncLine] : []),
		nicknameSyncLine,
		`requestId=\`${requestId}\``
	].join('\n');
}

/**
 * Gives the new account the badge for its merged total and takes the badge off the old account,
 * which now has no merits. The migration is already committed, so this never throws.
 * Returns null while badge sync is off, so the reply is unchanged until the cutover.
 */
async function syncMeritBadgesAfterMigration({
	guild,
	context,
	oldDiscordUserId,
	newDiscordUserId,
	logger
}: {
	guild: Guild;
	context: ExecutionContext;
	oldDiscordUserId: string;
	newDiscordUserId: string;
	logger: {
		error: (...values: readonly unknown[]) => void;
	};
}): Promise<string | null> {
	try {
		const badges = createMeritBadgeSyncRuntime({
			guild,
			context: createChildExecutionContext({
				context,
				bindings: {
					oldDiscordUserId,
					newDiscordUserId,
					step: 'syncMeritBadgesAfterStaffUserMigrate'
				}
			}),
			auditReason: `Merit badge sync after /staff user_migrate (${oldDiscordUserId} -> ${newDiscordUserId})`
		});
		// No total override: each sync reads the committed total (merged for the new account, 0 for the old).
		const newResult = await badges.syncMember({ discordUserId: newDiscordUserId });
		const oldResult = await badges.syncMember({ discordUserId: oldDiscordUserId });
		if (newResult.kind === 'disabled' && oldResult.kind === 'disabled') {
			return null;
		}

		return `Merit badge sync: new account ${describeBadgeSyncResult(newResult)}; old account ${describeBadgeSyncResult(oldResult)}.`;
	} catch (error: unknown) {
		logger.error(
			{
				errorName: error instanceof Error ? error.name : undefined,
				oldDiscordUserId,
				newDiscordUserId
			},
			'Failed to sync merit badges after staff user_migrate command'
		);
		return 'Merit badge sync could not complete. The migration itself succeeded.';
	}
}

function describeBadgeSyncResult(result: MeritBadgeSyncResult) {
	switch (result.kind) {
		case 'updated':
			return 'updated';
		case 'unchanged':
			return 'already correct';
		case 'member_not_found':
			return 'not in the server';
		case 'skipped_bot':
			return 'skipped (bot)';
		case 'disabled':
			return 'skipped (sync off)';
		case 'failed':
			return `could not be updated (\`${result.code}\`)`;
	}
}

async function copyRolesFromOldMemberToNewMember({
	guild,
	oldMember,
	newMember,
	oldDiscordUserId,
	newDiscordUserId,
	badgeRoleIds,
	logger
}: {
	guild: { id: string };
	oldMember: {
		roles: {
			cache: Map<string, { id: string; managed?: boolean }>;
			add: (roleId: string, reason: string) => Promise<unknown>;
		};
	} | null;
	newMember: {
		roles: {
			cache: Map<string, { id: string; managed?: boolean }>;
			add: (roleId: string, reason: string) => Promise<unknown>;
		};
	} | null;
	oldDiscordUserId: string;
	newDiscordUserId: string;
	/** Badge roles follow the merit total, so the badge sync sets them instead. */
	badgeRoleIds: ReadonlySet<string>;
	logger: {
		error: (...values: readonly unknown[]) => void;
	};
}) {
	if (!newMember) {
		return 'Role copy skipped because the new user is not present in the configured guild.';
	}

	if (!oldMember) {
		return 'Role copy skipped because the old user is not present in the configured guild.';
	}

	const rolesToCopy = [...oldMember.roles.cache.values()].filter(
		(role) => role.id !== guild.id && role.managed !== true && !badgeRoleIds.has(role.id) && !newMember.roles.cache.has(role.id)
	);

	if (rolesToCopy.length === 0) {
		return 'Role copy: no additional roles were needed.';
	}

	let copiedCount = 0;
	let failedCount = 0;
	for (const role of rolesToCopy) {
		try {
			await newMember.roles.add(role.id, `Copied role from old account via /staff user_migrate (${oldDiscordUserId} -> ${newDiscordUserId})`);
			copiedCount += 1;
		} catch (error: unknown) {
			failedCount += 1;
			logger.error(
				{
					err: error,
					oldDiscordUserId,
					newDiscordUserId,
					roleId: role.id
				},
				'Failed to copy Discord role during staff user_migrate command'
			);
		}
	}

	if (failedCount === 0) {
		return `Role copy: added ${copiedCount} roles from the old user.`;
	}

	return `Role copy: added ${copiedCount} roles from the old user; ${failedCount} roles could not be applied due to Discord permissions or role hierarchy.`;
}
