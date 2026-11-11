import type { Subcommand } from '@sapphire/plugin-subcommands';

import { resolveInteractionActor } from '../../../discord/interactions/interactionPreflight';
import { prepareGuildInteraction } from '../../../discord/interactions/prepareGuildInteraction';
import { parseDiscordUserIdInput } from '../../../discord/members/memberDirectory';
import type { ExecutionContext } from '../../../logging/executionContext';
import {
	MERIT_BADGE_BULK_RUN_LOCK,
	buildMeritBadgeCutoverReport,
	checkMeritBadgeLiveRunReadiness,
	runMeritBadgeBulkSync,
	type MeritBadgeBulkRunLock
} from '../../../services/merit-badge/meritBadgeBulkSyncService';
import { runMeritBadgeRoleCheck } from '../../../services/merit-badge/runMeritBadgeRoleCheck';
import { buildMeritBadgeDryRunPayload, buildMeritBadgeLiveRunPayload, buildMeritBadgeNotReadyMessage } from './buildMeritBadgeSyncPayload';
import { createStaffMeritBadgeSyncDeps } from './createStaffMeritBadgeSyncDeps';

type HandleStaffMeritBadgeSyncParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
	runLock?: MeritBadgeBulkRunLock;
};

/**
 * `/staff merit_badges sync [user] [dry_run]`. Dry run by default: a read-only cutover report with a
 * CSV. A live run applies badges only when `dry_run` is false, and only one live run at a time.
 */
export async function handleStaffMeritBadgeSync({ interaction, context, runLock = MERIT_BADGE_BULK_RUN_LOCK }: HandleStaffMeritBadgeSyncParams) {
	const dryRun = interaction.options.getBoolean('dry_run', false) ?? true;
	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller: 'handleStaffMeritBadgeSync',
		loggerBindings: { dryRun },
		guildLogMessage: 'Failed to resolve configured guild for staff merit badge sync command',
		guildFailureMessage: 'Failed to resolve guild for merit badge sync.',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}
	const { guild, logger, responder } = prepared;

	// `/staff` has the StaffOnly precondition; this re-checks the staff capability in the configured guild (D15).
	const actor = await resolveInteractionActor({
		guild,
		discordUserId: interaction.user.id,
		responder,
		logger,
		logMessage: 'Failed to resolve actor for staff merit badge sync command',
		failureMessage: 'Could not resolve your member record. Please contact TECH with:',
		requestId: true,
		capabilityRequirement: 'staff',
		unauthorizedMessage: 'Only staff can use this command.'
	});
	if (!actor) {
		return;
	}

	const optionValue = interaction.options.getString('user', false);
	const requestedDiscordUserId = parseDiscordUserIdInput(optionValue);
	if (optionValue && !requestedDiscordUserId) {
		await responder.safeEditReply({
			content: `Invalid \`user\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
		});
		return;
	}
	const noMembersMessage = requestedDiscordUserId
		? `Selected user is not in this server, or is a bot. requestId=\`${context.requestId}\``
		: `No members found in this server. requestId=\`${context.requestId}\``;

	try {
		const deps = createStaffMeritBadgeSyncDeps({ guild, context });

		if (dryRun) {
			const [report, roleCheck] = await Promise.all([
				buildMeritBadgeCutoverReport(deps, { requestedDiscordUserId }),
				runMeritBadgeRoleCheck({ guild, logger, roleMap: deps.roleMap })
			]);
			if (report.kind === 'no_members') {
				await responder.safeEditReply({ content: noMembersMessage });
				return;
			}
			if (report.kind === 'read_failed') {
				logger.error({ dryRun }, 'merit_badge.bulk_sync.dry_run_read_failed');
				await responder.fail('Could not read merit totals. Nothing was changed.', { requestId: true });
				return;
			}

			logger.info(
				{
					dryRun,
					scope: requestedDiscordUserId ? 'single' : 'all',
					memberCount: report.rows.length,
					noBadgeCount: report.noBadgeCount,
					...report.actionCounts,
					configuredTierCount: deps.roleMap.configuredRoles.length,
					roleCheckStatus: roleCheck.status,
					roleIssueCount: roleCheck.status === 'checked' ? roleCheck.issues.length : null
				},
				'merit_badge.bulk_sync.dry_run_completed'
			);
			await responder.safeEditReply(buildMeritBadgeDryRunPayload({ report, roleCheck, roleMap: deps.roleMap, requestId: context.requestId }));
			return;
		}

		const release = runLock.tryAcquire();
		if (!release) {
			await responder.safeEditReply({
				content: `A live merit badge sync is already running. Wait for it to finish, then run again. requestId=\`${context.requestId}\``
			});
			return;
		}

		try {
			const readiness = checkMeritBadgeLiveRunReadiness({ roleMap: deps.roleMap, ...(await deps.loadBotRoleAccess()) });
			if (!readiness.ok) {
				logger.warn({ dryRun, reason: readiness.reason }, 'merit_badge.bulk_sync.not_ready');
				await responder.safeEditReply({ content: `${buildMeritBadgeNotReadyMessage(readiness)} requestId=\`${context.requestId}\`` });
				return;
			}

			await responder.safeEditReply({
				content: `Live merit badge sync started. This can take up to 12 minutes. requestId=\`${context.requestId}\``
			});

			const result = await runMeritBadgeBulkSync(deps, { requestedDiscordUserId });
			if (result.kind === 'no_members') {
				await responder.safeEditReply({ content: noMembersMessage });
				return;
			}

			const logBindings = { dryRun, scope: requestedDiscordUserId ? 'single' : 'all', ...result };
			if (result.kind === 'partial' || result.failed > 0) {
				logger.warn(logBindings, 'merit_badge.bulk_sync.completed_with_issues');
			} else {
				logger.info(logBindings, 'merit_badge.bulk_sync.completed');
			}
			await responder.safeEditReply(buildMeritBadgeLiveRunPayload({ result, requestId: context.requestId }));
		} finally {
			release();
		}
	} catch (error: unknown) {
		logger.error({ err: error, dryRun }, 'Unhandled error while running staff merit badge sync command');
		await responder.fail('Failed to complete the merit badge sync due to an unexpected error.', { requestId: true });
	}
}
