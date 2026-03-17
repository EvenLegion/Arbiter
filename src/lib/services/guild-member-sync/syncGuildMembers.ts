import { toErrorDetails } from '../../logging/errorDetails';
import type { GuildMemberSyncDeps, GuildMemberSyncResult } from './guildMemberSyncTypes';
import type { GuildMemberSnapshot, GuildMemberSyncCounters, GuildMemberSyncFailure, GuildMemberSyncProgress } from './guildMemberSyncTypes';

export async function syncGuildMembers<TMember>(deps: GuildMemberSyncDeps<TMember>): Promise<GuildMemberSyncResult> {
	try {
		await deps.refreshDivisionCache();
	} catch (error) {
		return {
			kind: 'division_cache_refresh_failed',
			...toErrorDetails(error)
		};
	}

	let members: TMember[];
	try {
		members = await deps.listMembers();
	} catch (error) {
		return {
			kind: 'members_load_failed',
			...toErrorDetails(error)
		};
	}

	const progress = createGuildMemberSyncProgress();
	for (const member of members) {
		await syncGuildMemberRecord(deps, progress, member);
	}

	return {
		kind: 'completed',
		...finalizeGuildMemberSyncResult(progress)
	};
}

function createGuildMemberSyncProgress(): GuildMemberSyncProgress {
	return {
		totalMembers: 0,
		botMembersSkipped: 0,
		usersUpserted: 0,
		membershipSyncSucceeded: 0,
		nicknameComputed: 0,
		nicknameUpdated: 0,
		nicknameUnchanged: 0,
		failedMembers: []
	};
}

async function syncGuildMemberRecord<TMember>(deps: GuildMemberSyncDeps<TMember>, progress: GuildMemberSyncProgress, member: TMember) {
	progress.totalMembers++;
	const snapshot = deps.buildSnapshot(member);
	if (snapshot.isBot) {
		progress.botMembersSkipped++;
		return;
	}

	let dbUserId: string | null = null;

	try {
		const dbUser = await deps.upsertUser({
			discordUserId: snapshot.discordUserId,
			discordUsername: snapshot.discordUsername,
			discordNickname: snapshot.discordNickname,
			discordAvatarUrl: snapshot.discordAvatarUrl
		});
		dbUserId = dbUser.id;
		progress.usersUpserted++;
	} catch (error) {
		progress.failedMembers.push(buildFailure(snapshot, dbUserId, error));
		return;
	}

	try {
		await deps.reconcileMemberships({
			member
		});
		progress.membershipSyncSucceeded++;
	} catch (error) {
		progress.failedMembers.push(buildFailure(snapshot, dbUserId, error));
		return;
	}

	try {
		const nicknameResult = await deps.syncNickname({
			member,
			dbUserId
		});
		if (nicknameResult.outcome === 'skipped') {
			return;
		}

		progress.nicknameComputed++;
		if (nicknameResult.outcome === 'updated') {
			progress.nicknameUpdated++;
		} else {
			progress.nicknameUnchanged++;
		}
	} catch (error) {
		progress.failedMembers.push(buildFailure(snapshot, dbUserId, error));
	}
}

function finalizeGuildMemberSyncResult(progress: GuildMemberSyncProgress): GuildMemberSyncCounters & {
	failedMembers: GuildMemberSyncFailure[];
} {
	return {
		totalMembers: progress.totalMembers,
		botMembersSkipped: progress.botMembersSkipped,
		usersUpserted: progress.usersUpserted,
		membershipSyncSucceeded: progress.membershipSyncSucceeded,
		nicknameComputed: progress.nicknameComputed,
		nicknameUpdated: progress.nicknameUpdated,
		nicknameUnchanged: progress.nicknameUnchanged,
		failedMembers: progress.failedMembers
	};
}

function buildFailure(snapshot: GuildMemberSnapshot, dbUserId: string | null, error: unknown): GuildMemberSyncFailure {
	return {
		discordUserId: snapshot.discordUserId,
		discordUsername: snapshot.discordUsername,
		discordNickname: snapshot.discordNickname,
		dbUserId,
		reason: error instanceof Error ? error.message : 'Unknown error'
	};
}
