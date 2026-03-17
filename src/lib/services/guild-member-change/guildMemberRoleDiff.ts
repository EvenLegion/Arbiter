import type { GuildMemberChangeRoleDiff } from './guildMemberChangeTypes';

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
