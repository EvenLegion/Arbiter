import type { Guild, GuildMember } from 'discord.js';

import { getGuildMember } from '../../discord/guildMemberGateway';
import type { ExecutionContext } from '../../logging/executionContext';
import type { NicknameComputeResult, NicknameSyncResult } from '../../services/nickname/contracts';
import { computeGuildNickname, syncGuildNickname } from './guildNicknameGateway';

type ResolveGuildMember = (discordUserId: string) => Promise<GuildMember | null>;

type CreateGuildNicknameServiceDepsParams = {
	guild: Guild;
	context: ExecutionContext;
	resolveMember?: ResolveGuildMember;
	includeStaff?: boolean;
};

export function createGuildNicknameServiceDeps({
	guild,
	context,
	includeStaff = false,
	resolveMember = (discordUserId) => getGuildMember({ guild, discordUserId })
}: CreateGuildNicknameServiceDepsParams) {
	return {
		getMember: resolveMember,
		computeNickname: ({
			member,
			baseDiscordNicknameOverride,
			totalMeritsOverride,
			contextBindings
		}: {
			member: GuildMember;
			baseDiscordNicknameOverride?: string;
			totalMeritsOverride?: number;
			contextBindings?: Record<string, unknown>;
		}): Promise<NicknameComputeResult> =>
			computeGuildNickname({
				member,
				context,
				baseDiscordNicknameOverride,
				totalMeritsOverride,
				contextBindings
			}),
		syncComputedNickname: ({
			member,
			setReason,
			totalMeritsOverride,
			contextBindings
		}: {
			member: GuildMember;
			setReason: string;
			totalMeritsOverride?: number;
			contextBindings?: Record<string, unknown>;
		}): Promise<NicknameSyncResult<GuildMember>> =>
			syncGuildNickname({
				member,
				context,
				includeStaff,
				setReason,
				totalMeritsOverride,
				contextBindings
			})
	};
}
