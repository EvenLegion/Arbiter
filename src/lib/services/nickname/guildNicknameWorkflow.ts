import { type GuildMember } from 'discord.js';

import { createGuildNicknameServiceDeps, type CreateGuildNicknameServiceDepsParams } from './createGuildNicknameServiceDeps';
import { computeNicknameForUser, syncNicknameForUser } from './nicknameService';

export function createGuildNicknameWorkflow({ guild, context, includeStaff = false, resolveMember }: CreateGuildNicknameServiceDepsParams) {
	const deps = createGuildNicknameServiceDeps({
		guild,
		context,
		includeStaff,
		resolveMember
	});

	return {
		computeNickname: (params: Parameters<typeof computeNicknameForUser<GuildMember>>[1]) => computeNicknameForUser(deps, params),
		syncNickname: (params: Parameters<typeof syncNicknameForUser<GuildMember>>[1]) => syncNicknameForUser(deps, params)
	};
}
