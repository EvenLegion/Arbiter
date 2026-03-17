import { computeGuildMemberRoleDiff } from './guildMemberRoleDiff';
import type { GuildMemberChangeDeps, GuildMemberChangeResult } from './guildMemberChangeTypes';

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
