import type { SyncNicknameForUserResult } from '../nickname/nicknameService';

export type GuildMemberChangeRoleDiff = {
	oldMemberIsPartial: boolean;
	haveRolesChanged: boolean;
	oldRoleIds: string[];
	newRoleIds: string[];
	addedRoleIds: string[];
	removedRoleIds: string[];
};

export type GuildMemberChangeMembershipResult = {
	addedDivisions: Array<{
		id: number;
		name: string | undefined;
		discordRoleId: string | null | undefined;
	}>;
	removedDivisions: Array<{
		id: number;
		name: string | undefined;
		discordRoleId: string | null | undefined;
	}>;
};

export type GuildMemberNicknameOutcome =
	| { kind: 'sync_failed'; reason: string; errorMessage?: string; errorName?: string; errorCode?: string }
	| { kind: 'skipped'; reason: string | undefined }
	| { kind: 'unchanged'; computedNickname: string }
	| { kind: 'updated'; computedNickname: string };

export type GuildMemberChangeDeps<TMember> = {
	resolveMember: (params: { discordUserId: string }) => Promise<TMember | null>;
	reconcileMemberships: (params: { member: TMember }) => Promise<GuildMemberChangeMembershipResult>;
	syncNickname: (params: { member: TMember }) => Promise<GuildMemberNicknameOutcome>;
};

export type GuildMemberChangeResult =
	| {
			kind: 'skipped_no_role_change';
			discordUserId: string;
			roleDiff: GuildMemberChangeRoleDiff;
	  }
	| {
			kind: 'member_not_found';
			discordUserId: string;
			roleDiff: GuildMemberChangeRoleDiff;
	  }
	| {
			kind: 'processed';
			discordUserId: string;
			roleDiff: GuildMemberChangeRoleDiff;
			membership: GuildMemberChangeMembershipResult;
			nickname: GuildMemberNicknameOutcome;
	  };

export type GuildMemberSyncSource<TMember> = SyncNicknameForUserResult<TMember>;
