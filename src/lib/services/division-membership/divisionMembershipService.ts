export type DivisionMembershipMutationMode = 'add' | 'remove';

type DivisionMembershipTargetUser = {
	id: string;
	discordUserId: string;
	discordUsername: string;
};

type DivisionMembershipSelection = {
	id: number;
	code: string;
	name: string;
};

type DivisionMembershipNicknameSyncResult =
	| { kind: 'not_requested' }
	| { kind: 'updated' | 'unchanged'; computedNickname: string }
	| { kind: 'skipped'; reason: string }
	| { kind: 'member-not-found' }
	| { kind: 'guild-unavailable'; errorMessage?: string; errorName?: string; errorCode?: string }
	| { kind: 'failed'; errorMessage?: string; errorName?: string; errorCode?: string };

type DivisionMembershipServiceDeps = {
	findTargetUser: (discordUserId: string) => Promise<DivisionMembershipTargetUser | null>;
	findDivision: (selection: string) => Promise<DivisionMembershipSelection | null>;
	listMemberships: (userId: string) => Promise<Array<{ divisionId: number }>>;
	addMemberships: (params: { userId: string; divisionIds: number[] }) => Promise<{ count: number }>;
	removeMemberships: (params: { userId: string; divisionIds: number[] }) => Promise<{ count: number }>;
	syncNickname: (params: { targetDiscordUserId: string; mode: DivisionMembershipMutationMode }) => Promise<DivisionMembershipNicknameSyncResult>;
};

export type DivisionMembershipMutationResult =
	| { kind: 'target_user_not_found' }
	| { kind: 'division_not_found' }
	| { kind: 'membership_exists'; targetDiscordUserId: string; divisionName: string }
	| { kind: 'membership_missing'; targetDiscordUserId: string; divisionName: string }
	| {
			kind: 'updated';
			mode: DivisionMembershipMutationMode;
			targetDiscordUserId: string;
			targetDbUserId: string;
			targetDiscordUsername: string;
			divisionId: number;
			divisionCode: string;
			divisionName: string;
			changeCount: number;
			nicknameSync: DivisionMembershipNicknameSyncResult;
	  };

export async function applyDivisionMembershipMutation(
	deps: DivisionMembershipServiceDeps,
	input: {
		mode: DivisionMembershipMutationMode;
		targetDiscordUserId: string;
		divisionSelection: string;
		syncNickname: boolean;
	}
): Promise<DivisionMembershipMutationResult> {
	const [targetUser, division] = await Promise.all([deps.findTargetUser(input.targetDiscordUserId), deps.findDivision(input.divisionSelection)]);
	if (!targetUser) {
		return {
			kind: 'target_user_not_found'
		};
	}
	if (!division) {
		return {
			kind: 'division_not_found'
		};
	}

	const existingMemberships = await deps.listMemberships(targetUser.id);
	const hasMembership = existingMemberships.some((membership) => membership.divisionId === division.id);
	if (input.mode === 'add' && hasMembership) {
		return {
			kind: 'membership_exists',
			targetDiscordUserId: targetUser.discordUserId,
			divisionName: division.name
		};
	}
	if (input.mode === 'remove' && !hasMembership) {
		return {
			kind: 'membership_missing',
			targetDiscordUserId: targetUser.discordUserId,
			divisionName: division.name
		};
	}

	const mutationResult =
		input.mode === 'add'
			? await deps.addMemberships({
					userId: targetUser.id,
					divisionIds: [division.id]
				})
			: await deps.removeMemberships({
					userId: targetUser.id,
					divisionIds: [division.id]
				});

	return {
		kind: 'updated',
		mode: input.mode,
		targetDiscordUserId: targetUser.discordUserId,
		targetDbUserId: targetUser.id,
		targetDiscordUsername: targetUser.discordUsername,
		divisionId: division.id,
		divisionCode: division.code,
		divisionName: division.name,
		changeCount: mutationResult.count,
		nicknameSync: input.syncNickname
			? await deps.syncNickname({
					targetDiscordUserId: targetUser.discordUserId,
					mode: input.mode
				})
			: {
					kind: 'not_requested'
				}
	};
}
