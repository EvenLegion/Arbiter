import { DivisionKind } from '@prisma/client';
import type { GuildMember } from 'discord.js';

import { divisionRepository } from '../../../integrations/prisma/repositories';
import { memberHasDivisionKindRole } from '../../discord/guild/divisions';
import { getDbUserOrThrow } from '../../discord/guild/users';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { buildUserNickname } from './buildUserNickname';
import type { NicknameComputeResult, NicknameSyncResult } from './nicknameService';

export async function computeGuildNickname({
	member,
	context,
	contextBindings,
	baseDiscordNicknameOverride
}: {
	member: GuildMember;
	context: ExecutionContext;
	contextBindings?: Record<string, unknown>;
	baseDiscordNicknameOverride?: string;
}): Promise<NicknameComputeResult> {
	const scopedContext = createChildExecutionContext({
		context,
		bindings: contextBindings ?? { step: 'buildUserNickname' }
	});
	const nicknameInputs = await loadGuildNicknameInputs({
		discordUserId: member.id,
		baseDiscordNicknameOverride
	});
	const nicknameResult = buildUserNickname({
		isGuildOwner: member.guild.ownerId === member.id,
		baseNickname: nicknameInputs.baseNickname,
		divisions: nicknameInputs.divisions
	});

	// No nickname values here: bulk dry runs pass through this path and must keep nicknames out of logs.
	scopedContext.logger.trace(
		{
			discordUserId: member.id,
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
	dryRun = false,
	contextBindings
}: {
	member: GuildMember;
	context: ExecutionContext;
	setReason: string;
	includeStaff?: boolean;
	/** Decide exactly as a live sync would, but never call `setNickname`. `updated` then means "would update". */
	dryRun?: boolean;
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

	if (dryRun) {
		return {
			outcome: 'updated',
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

async function loadGuildNicknameInputs({
	discordUserId,
	baseDiscordNicknameOverride
}: {
	discordUserId: string;
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
		baseNickname: baseDiscordNicknameOverride ?? dbUser.discordNickname
	};
}
