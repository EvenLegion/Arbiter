import { DivisionKind } from '@prisma/client';
import type { Guild, GuildMember } from 'discord.js';

import { divisionRepository, meritRepository } from '../../../integrations/prisma/repositories';
import { memberHasDivisionKindRole } from '../../discord/guild/divisions';
import { getGuildMember } from '../../discord/guild/guildMembers';
import { getDbUserOrThrow } from '../../discord/guild/users';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { buildUserNickname } from './buildUserNickname';
import { computeNicknameForUser, syncNicknameForUser, type NicknameComputeResult, type NicknameSyncResult } from './nicknameService';

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

export function createGuildNicknameWorkflowGateway({
	guild,
	context,
	includeStaff = false,
	resolveMember
}: {
	guild: Guild;
	context: ExecutionContext;
	includeStaff?: boolean;
	resolveMember?: ResolveGuildMember;
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

async function computeGuildNickname({
	member,
	context,
	totalMeritsOverride,
	contextBindings,
	baseDiscordNicknameOverride
}: {
	member: GuildMember;
	context: ExecutionContext;
	totalMeritsOverride?: number;
	contextBindings?: Record<string, unknown>;
	baseDiscordNicknameOverride?: string;
}): Promise<NicknameComputeResult> {
	const scopedContext = createChildExecutionContext({
		context,
		bindings: contextBindings ?? { step: 'buildUserNickname' }
	});
	const nicknameInputs = await loadUserNicknameInputs({
		discordUserId: member.id,
		totalMeritsOverride,
		baseDiscordNicknameOverride
	});
	const nicknameResult = buildUserNickname({
		isGuildOwner: member.guild.ownerId === member.id,
		baseNickname: nicknameInputs.baseNickname,
		divisions: nicknameInputs.divisions,
		totalMerits: nicknameInputs.totalMerits
	});

	scopedContext.logger.trace(
		{
			discordUserId: member.id,
			computedNickname: nicknameResult.newUserNickname,
			computeSkipReason: nicknameResult.reason
		},
		'Computed nickname for guild member'
	);

	return {
		computedNickname: nicknameResult.newUserNickname,
		reason: nicknameResult.reason
	};
}

async function syncGuildNickname({
	member,
	context,
	setReason,
	includeStaff = false,
	totalMeritsOverride,
	contextBindings
}: {
	member: GuildMember;
	context: ExecutionContext;
	setReason: string;
	includeStaff?: boolean;
	totalMeritsOverride?: number;
	contextBindings?: Record<string, unknown>;
}): Promise<NicknameSyncResult<GuildMember>> {
	if (!includeStaff) {
		const hasStaffRole = await memberHasDivisionKindRole({
			member,
			requiredRoleKinds: [DivisionKind.STAFF]
		});

		if (hasStaffRole) {
			return {
				outcome: 'skipped',
				member,
				computedNickname: null,
				reason: 'User has a staff role'
			};
		}
	}

	const nicknameResult = await computeGuildNickname({
		member,
		context,
		totalMeritsOverride,
		contextBindings
	});

	if (nicknameResult.computedNickname === null) {
		return {
			outcome: 'skipped',
			member,
			computedNickname: null,
			reason: nicknameResult.reason
		};
	}

	if (member.nickname === nicknameResult.computedNickname) {
		return {
			outcome: 'unchanged',
			member,
			computedNickname: nicknameResult.computedNickname
		};
	}

	const updatedMember = await member.setNickname(nicknameResult.computedNickname, setReason);
	return {
		outcome: 'updated',
		member: updatedMember,
		computedNickname: nicknameResult.computedNickname
	};
}

async function loadUserNicknameInputs({
	discordUserId,
	totalMeritsOverride,
	baseDiscordNicknameOverride
}: {
	discordUserId: string;
	totalMeritsOverride?: number;
	baseDiscordNicknameOverride?: string;
}) {
	const [divisions, dbUser] = await Promise.all([
		divisionRepository.listUserDivisions({
			discordUserId
		}),
		getDbUserOrThrow({ discordUserId })
	]);

	return {
		divisions,
		baseNickname: baseDiscordNicknameOverride ?? dbUser.discordNickname,
		totalMerits:
			typeof totalMeritsOverride === 'number'
				? totalMeritsOverride
				: await meritRepository.getUserTotalMerits({
						userDbUserId: dbUser.id
					})
	};
}
