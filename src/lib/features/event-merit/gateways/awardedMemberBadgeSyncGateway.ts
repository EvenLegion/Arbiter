import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { createMeritBadgeSyncRuntime, type MeritBadgeSyncRuntime } from '../../../services/merit-badge/createMeritBadgeSyncRuntime';

/**
 * Syncs the merit badge of each member awarded in a finalized event review.
 *
 * Runs after the awards committed. Each total is read fresh inside the member lock (no override),
 * so a missing or stale batch total can never strip a badge. One member at a time, to keep the
 * Discord role calls gentle. Never throws; failures are logged and counted.
 */
export async function syncAwardedMemberBadges({
	guild,
	awardedUsers,
	context,
	logger,
	createRuntime = createMeritBadgeSyncRuntime,
	now = Date.now
}: {
	guild: Guild;
	awardedUsers: Array<{ discordUserId: string }>;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
	createRuntime?: (params: { guild: Guild; context: ExecutionContext; auditReason: string }) => MeritBadgeSyncRuntime;
	now?: () => number;
}) {
	const discordUserIds = [...new Set(awardedUsers.map((awardedUser) => awardedUser.discordUserId))];
	if (discordUserIds.length === 0) {
		return;
	}

	const startedAt = now();
	try {
		const badges = createRuntime({
			guild,
			context,
			auditReason: 'Merit badge sync after event review'
		});

		let updatedCount = 0;
		let failedCount = 0;
		for (const discordUserId of discordUserIds) {
			const result = await badges.syncMember({ discordUserId });
			if (result.kind === 'disabled') {
				return;
			}
			if (result.kind === 'updated') {
				updatedCount++;
			} else if (result.kind === 'failed') {
				failedCount++;
			}
		}

		const summary = {
			memberCount: discordUserIds.length,
			updatedCount,
			failedCount,
			durationMs: now() - startedAt
		};
		if (failedCount > 0) {
			logger.warn(summary, 'event.review.merit_badge_sync.completed_with_failures');
		} else {
			logger.info(summary, 'event.review.merit_badge_sync.completed');
		}
	} catch (error) {
		logger.error(
			{
				memberCount: discordUserIds.length,
				errorName: error instanceof Error ? error.name : undefined
			},
			'event.review.merit_badge_sync.failed'
		);
	}
}
