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
	dryRun?: boolean;
};

export function createGuildNicknameServiceDeps({
	guild,
	context,
	includeStaff = false,
	dryRun = false,
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
			contextBindings
		}: {
			member: GuildMember;
			baseDiscordNicknameOverride?: string;
			contextBindings?: Record<string, unknown>;
		}) =>
			computeGuildNickname({
				member,
				context,
				baseDiscordNicknameOverride,
				contextBindings
			}),
		syncComputedNickname: ({
			member,
			setReason,
			contextBindings
		}: {
			member: GuildMember;
			setReason: string;
			contextBindings?: Record<string, unknown>;
		}) =>
			syncGuildNickname({
				member,
				context,
				includeStaff,
				dryRun,
				setReason,
				contextBindings
			})
	};
}
