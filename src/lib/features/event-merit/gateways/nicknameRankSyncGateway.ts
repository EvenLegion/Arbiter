import type { Guild } from 'discord.js';

import { meritRepository } from '../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createGuildMemberAccessGateway } from '../../../services/guild-member/guildMemberAccessGateway';
import { notifyMeritRankUp } from '../../../services/merit-rank/notifyMeritRankUp';
import { createGuildNicknameServiceDeps } from '../../../services/nickname/createGuildNicknameServiceDeps';
import { syncNicknameForUser } from '../../../services/nickname/nicknameService';

const AWARDED_MEMBER_SYNC_CONCURRENCY = 3;

export async function syncAwardedMemberNicknamesAndNotifyRankUp({
	guild,
	awardedUsers,
	context,
	logger
}: {
	guild: Guild;
	awardedUsers: Array<{
		dbUserId: string;
		discordUserId: string;
		awardedMeritAmount: number;
	}>;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	if (awardedUsers.length === 0) {
		return;
	}

	const awardedUsersByDbUserId = new Map<
		string,
		{
			dbUserId: string;
			discordUserId: string;
			awardedMeritAmount: number;
		}
	>();
	for (const awardedUser of awardedUsers) {
		const existing = awardedUsersByDbUserId.get(awardedUser.dbUserId);
		if (existing) {
			existing.awardedMeritAmount += awardedUser.awardedMeritAmount;
			continue;
		}

		awardedUsersByDbUserId.set(awardedUser.dbUserId, {
			...awardedUser
		});
	}

	const uniqueAwardedUsers = [...awardedUsersByDbUserId.values()];
	const members = createGuildMemberAccessGateway({
		guild
	});
	const totalsByDbUserId = uniqueAwardedUsers.some((awardedUser) => awardedUser.awardedMeritAmount > 0)
		? await meritRepository
				.getUsersTotalMerits({
					userDbUserIds: uniqueAwardedUsers.map((awardedUser) => awardedUser.dbUserId)
				})
				.catch((error: unknown) => {
					logger.error(
						{
							err: error
						},
						'Failed to fetch total merits for awarded users'
					);
					return new Map<string, number>();
				})
		: new Map<string, number>();

	await runWithConcurrencyLimit(uniqueAwardedUsers, AWARDED_MEMBER_SYNC_CONCURRENCY, async (awardedUser) => {
		const discordUserId = awardedUser.discordUserId;
		const member = await members.getMember(discordUserId);
		if (!member) {
			logger.error(
				{
					discordUserId
				},
				'Failed to resolve awarded member for nickname sync'
			);
			return;
		}
		if (member.user.bot) {
			return;
		}

		const nicknameSyncResult = await syncNicknameForUser(
			createGuildNicknameServiceDeps({
				guild,
				context,
				resolveMember: async (lookupDiscordUserId) =>
					lookupDiscordUserId === discordUserId ? member : members.getMember(lookupDiscordUserId)
			}),
			{
				discordUserId,
				setReason: 'Event review merit rank sync',
				totalMeritsOverride: totalsByDbUserId.get(awardedUser.dbUserId),
				contextBindings: {
					step: 'syncAwardedMemberNickname',
					discordUserId
				}
			}
		);
		if (nicknameSyncResult.kind === 'sync-failed' || nicknameSyncResult.kind === 'member-not-found') {
			logger.error(
				{
					discordUserId,
					outcome: nicknameSyncResult.kind,
					...('errorMessage' in nicknameSyncResult ? { errorMessage: nicknameSyncResult.errorMessage } : {}),
					...('errorName' in nicknameSyncResult ? { errorName: nicknameSyncResult.errorName } : {}),
					...('errorCode' in nicknameSyncResult ? { errorCode: nicknameSyncResult.errorCode } : {})
				},
				'Failed to sync awarded member nickname after review finalization'
			);
		} else if (nicknameSyncResult.kind === 'nickname-too-long') {
			logger.warn(
				{
					discordUserId
				},
				'Skipped awarded member nickname sync because the computed nickname exceeds Discord limits'
			);
		}

		if (awardedUser.awardedMeritAmount > 0) {
			const currentTotalMerits = totalsByDbUserId.get(awardedUser.dbUserId);
			if (typeof currentTotalMerits !== 'number') {
				logger.error(
					{
						discordUserId,
						dbUserId: awardedUser.dbUserId
					},
					'Skipping rank-up notification because total merits could not be resolved'
				);
				return;
			}
			const previousTotalMerits = Math.max(0, currentTotalMerits - awardedUser.awardedMeritAmount);
			await notifyMeritRankUp({
				member,
				previousTotalMerits,
				currentTotalMerits,
				logger
			});
		}
	});
}

async function runWithConcurrencyLimit<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>) {
	if (items.length === 0) {
		return;
	}

	const maxConcurrency = Math.max(1, Math.min(concurrency, items.length));
	let nextIndex = 0;

	const runners = Array.from({ length: maxConcurrency }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex++;
			await worker(items[currentIndex]);
		}
	});

	await Promise.all(runners);
}
