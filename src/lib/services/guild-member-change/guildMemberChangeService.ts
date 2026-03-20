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

export function computeGuildMemberRoleDiff(input: {
	oldMemberIsPartial: boolean;
	oldRoleIds: string[];
	newRoleIds: string[];
}): GuildMemberChangeRoleDiff {
	const oldRoleIds = input.oldMemberIsPartial ? [] : input.oldRoleIds;
	const newRoleIds = input.newRoleIds;
	const addedRoleIds = newRoleIds.filter((roleId) => !oldRoleIds.includes(roleId));
	const removedRoleIds = oldRoleIds.filter((roleId) => !newRoleIds.includes(roleId));

	return {
		oldMemberIsPartial: input.oldMemberIsPartial,
		haveRolesChanged: input.oldMemberIsPartial || addedRoleIds.length > 0 || removedRoleIds.length > 0,
		oldRoleIds,
		newRoleIds,
		addedRoleIds,
		removedRoleIds
	};
}

export function mapNicknameSyncResult<TMember>(result: SyncNicknameForUserResult<TMember>): GuildMemberNicknameOutcome {
	if (result.kind !== 'synced') {
		return {
			kind: 'sync_failed',
			reason: result.kind,
			...('errorMessage' in result ? { errorMessage: result.errorMessage } : {}),
			...('errorName' in result ? { errorName: result.errorName } : {}),
			...('errorCode' in result ? { errorCode: result.errorCode } : {})
		};
	}
	if (result.outcome === 'skipped') {
		return {
			kind: 'skipped',
			reason: result.reason
		};
	}
	if (result.outcome === 'updated') {
		return {
			kind: 'updated',
			computedNickname: result.computedNickname
		};
	}

	return {
		kind: 'unchanged',
		computedNickname: result.computedNickname
	};
}

export async function processGuildMemberRoleChange<TMember>(
	deps: GuildMemberChangeDeps<TMember>,
	input: {
		discordUserId: string;
		oldMemberIsPartial: boolean;
		oldRoleIds: string[];
		newRoleIds: string[];
	}
): Promise<GuildMemberChangeResult> {
	const roleDiff = computeGuildMemberRoleDiff({
		oldMemberIsPartial: input.oldMemberIsPartial,
		oldRoleIds: input.oldRoleIds,
		newRoleIds: input.newRoleIds
	});
	if (!roleDiff.haveRolesChanged) {
		return {
			kind: 'skipped_no_role_change',
			discordUserId: input.discordUserId,
			roleDiff
		};
	}

	const member = await deps.resolveMember({
		discordUserId: input.discordUserId
	});
	if (!member) {
		return {
			kind: 'member_not_found',
			discordUserId: input.discordUserId,
			roleDiff
		};
	}

	const membership = await deps.reconcileMemberships({
		member
	});
	const nickname = await deps.syncNickname({
		member
	});

	return {
		kind: 'processed',
		discordUserId: input.discordUserId,
		roleDiff,
		membership,
		nickname
	};
}
