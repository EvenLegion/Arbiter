import type { MeritBadgeSyncFailureCode, MeritBadgeSyncResult, MeritBadgeSyncStage } from '../merit-badge/meritBadgeSyncService';
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

/** Badge sync outcome without totals, for logs. */
export type GuildMemberBadgeOutcome = {
	kind: MeritBadgeSyncResult['kind'];
	stage?: MeritBadgeSyncStage;
	code?: MeritBadgeSyncFailureCode;
};

export type GuildMemberChangeDeps<TMember> = {
	resolveMember: (params: { discordUserId: string }) => Promise<TMember | null>;
	reconcileMemberships: (params: { member: TMember }) => Promise<GuildMemberChangeMembershipResult>;
	syncNickname: (params: { member: TMember }) => Promise<GuildMemberNicknameOutcome>;
	/** True for a configured merit badge role. */
	isBadgeRole: (roleId: string) => boolean;
	/** Re-reads the member's total; listener paths never pass an override. Must not throw. */
	syncBadge: (params: { discordUserId: string }) => Promise<GuildMemberBadgeOutcome>;
};

export type GuildMemberChangeResult =
	| {
			kind: 'skipped_no_role_change';
			discordUserId: string;
			roleDiff: GuildMemberChangeRoleDiff;
	  }
	| {
			kind: 'badge_only';
			discordUserId: string;
			roleDiff: GuildMemberChangeRoleDiff;
			badge: GuildMemberBadgeOutcome;
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
			badge: GuildMemberBadgeOutcome;
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

/**
 * True when every added and removed role is a configured badge role.
 * A partial old member has no old roles to compare, so it is never badge-only.
 */
export function isBadgeOnlyRoleDiff(roleDiff: GuildMemberChangeRoleDiff, isBadgeRole: (roleId: string) => boolean) {
	if (roleDiff.oldMemberIsPartial || !roleDiff.haveRolesChanged) {
		return false;
	}

	return [...roleDiff.addedRoleIds, ...roleDiff.removedRoleIds].every((roleId) => isBadgeRole(roleId));
}

export function toGuildMemberBadgeOutcome(result: MeritBadgeSyncResult): GuildMemberBadgeOutcome {
	if (result.kind === 'failed') {
		return {
			kind: result.kind,
			stage: result.stage,
			code: result.code
		};
	}

	return {
		kind: result.kind
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

	// Badge roles never feed membership reconciliation or the nickname. A badge-only change
	// (our own sync, or someone editing a badge role by hand) only re-checks the badge.
	if (isBadgeOnlyRoleDiff(roleDiff, deps.isBadgeRole)) {
		return {
			kind: 'badge_only',
			discordUserId: input.discordUserId,
			roleDiff,
			badge: await deps.syncBadge({
				discordUserId: input.discordUserId
			})
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
	const badge = await deps.syncBadge({
		discordUserId: input.discordUserId
	});

	return {
		kind: 'processed',
		discordUserId: input.discordUserId,
		roleDiff,
		membership,
		nickname,
		badge
	};
}
