import { DivisionKind } from '@prisma/client';
import { container } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';

import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import type { NicknameComputeResult, NicknameSyncResult } from '../../services/nickname/contracts';
import { buildUserNickname } from './buildUserNickname';
import { loadUserNicknameInputs } from './loadUserNicknameInputs';

export async function computeGuildNickname({
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

export async function syncGuildNickname({
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
		const hasStaffRole = await container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
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
