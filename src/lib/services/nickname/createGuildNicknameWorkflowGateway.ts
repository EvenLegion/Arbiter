import type { Guild, GuildMember } from 'discord.js';

import type { ExecutionContext } from '../../logging/executionContext';
import { computeNicknameForUser, syncNicknameForUser } from './nicknameService';
import { createGuildNicknameServiceDeps } from './createGuildNicknameServiceDeps';

export function createGuildNicknameWorkflowGateway({
	guild,
	context,
	includeStaff = false,
	resolveMember
}: {
	guild: Guild;
	context: ExecutionContext;
	includeStaff?: boolean;
	resolveMember?: (discordUserId: string) => Promise<GuildMember | null>;
}) {
	const deps = createGuildNicknameServiceDeps({
		guild,
		context,
		includeStaff,
		resolveMember
	});

	return {
		computeNickname: (params: Parameters<typeof computeNicknameForUser>[1]) => computeNicknameForUser(deps, params),
		syncNickname: (params: Parameters<typeof syncNicknameForUser>[1]) => syncNicknameForUser(deps, params)
	};
}
