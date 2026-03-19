import type { Guild, GuildMember } from 'discord.js';

import { getGuildMember } from '../../discord/guild/guildMembers';
import type { ExecutionContext } from '../../logging/executionContext';
import { computeGuildNickname, syncGuildNickname } from './guildNicknameRuntime';

export type ResolveGuildMember = (discordUserId: string) => Promise<GuildMember | null>;

export type CreateGuildNicknameServiceDepsParams = {
	guild: Guild;
	context: ExecutionContext;
	resolveMember?: ResolveGuildMember;
	includeStaff?: boolean;
};

export function createGuildNicknameServiceDeps({
	guild,
	context,
	includeStaff = false,
	resolveMember = (discordUserId) =>
		getGuildMember({
			guild,
			discordUserId,
			logger: context.logger.child({
				caller: 'createGuildNicknameServiceDeps.resolveMember'
			})
		})
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
		}) =>
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
		}) =>
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
