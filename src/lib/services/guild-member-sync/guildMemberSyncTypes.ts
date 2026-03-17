import type { ErrorDetails } from '../../logging/errorDetails';

export type GuildMemberSyncFailure = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	dbUserId: string | null;
	reason: string;
};

export type GuildMemberSnapshot = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	discordAvatarUrl: string;
	isBot: boolean;
};

export type GuildMemberSyncDeps<TMember> = {
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
	| ({ kind: 'division_cache_refresh_failed' } & ErrorDetails)
	| ({ kind: 'members_load_failed' } & ErrorDetails)
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

export type GuildMemberSyncCounters = {
	totalMembers: number;
	botMembersSkipped: number;
	usersUpserted: number;
	membershipSyncSucceeded: number;
	nicknameComputed: number;
	nicknameUpdated: number;
	nicknameUnchanged: number;
};

export type GuildMemberSyncProgress = GuildMemberSyncCounters & {
	failedMembers: GuildMemberSyncFailure[];
};
