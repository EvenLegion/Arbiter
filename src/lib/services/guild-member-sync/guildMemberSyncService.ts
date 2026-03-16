export type GuildMemberSyncFailure = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	dbUserId: string | null;
	reason: string;
};

type GuildMemberSnapshot = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	discordAvatarUrl: string;
	isBot: boolean;
};

type GuildMemberSyncDeps<TMember> = {
	refreshDivisionCache: () => Promise<void>;
	listMembers: () => Promise<TMember[]>;
	buildSnapshot: (member: TMember) => GuildMemberSnapshot;
	upsertUser: (params: {
		discordUserId: string;
		discordUsername: string;
		discordNickname: string;
		discordAvatarUrl: string;
	}) => Promise<{ id: string }>;
	reconcileMemberships: (params: { member: TMember }) => Promise<void>;
	syncNickname: (params: { member: TMember; dbUserId: string }) => Promise<{
		outcome: 'updated' | 'unchanged' | 'skipped';
		reason?: string;
	}>;
};

export type GuildMemberSyncResult =
	| { kind: 'division_cache_refresh_failed' }
	| { kind: 'members_load_failed' }
	| {
			kind: 'completed';
			totalMembers: number;
			botMembersSkipped: number;
			usersUpserted: number;
			membershipSyncSucceeded: number;
			nicknameComputed: number;
			nicknameUpdated: number;
			nicknameUnchanged: number;
			failedMembers: GuildMemberSyncFailure[];
	  };

export async function syncGuildMembers<TMember>(deps: GuildMemberSyncDeps<TMember>): Promise<GuildMemberSyncResult> {
	try {
		await deps.refreshDivisionCache();
	} catch {
		return {
			kind: 'division_cache_refresh_failed'
		};
	}

	let members: TMember[];
	try {
		members = await deps.listMembers();
	} catch {
		return {
			kind: 'members_load_failed'
		};
	}

	let totalMembers = 0;
	let botMembersSkipped = 0;
	let usersUpserted = 0;
	let membershipSyncSucceeded = 0;
	let nicknameComputed = 0;
	let nicknameUpdated = 0;
	let nicknameUnchanged = 0;
	const failedMembers: GuildMemberSyncFailure[] = [];

	for (const member of members) {
		totalMembers++;
		const snapshot = deps.buildSnapshot(member);
		if (snapshot.isBot) {
			botMembersSkipped++;
			continue;
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
			usersUpserted++;
		} catch (error) {
			failedMembers.push(buildFailure(snapshot, dbUserId, error));
			continue;
		}

		try {
			await deps.reconcileMemberships({
				member
			});
			membershipSyncSucceeded++;
		} catch (error) {
			failedMembers.push(buildFailure(snapshot, dbUserId, error));
			continue;
		}

		try {
			const nicknameResult = await deps.syncNickname({
				member,
				dbUserId
			});
			if (nicknameResult.outcome === 'skipped') {
				continue;
			}

			nicknameComputed++;
			if (nicknameResult.outcome === 'updated') {
				nicknameUpdated++;
			} else {
				nicknameUnchanged++;
			}
		} catch (error) {
			failedMembers.push(buildFailure(snapshot, dbUserId, error));
		}
	}

	return {
		kind: 'completed',
		totalMembers,
		botMembersSkipped,
		usersUpserted,
		membershipSyncSucceeded,
		nicknameComputed,
		nicknameUpdated,
		nicknameUnchanged,
		failedMembers
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
