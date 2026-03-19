import type { Guild } from 'discord.js';

import { divisionRepository } from '../../../../integrations/prisma/repositories';
import { getGuildMember } from '../../../discord/guild/guildMembers';
import { getDbUser } from '../../../discord/guild/users';
import { toErrorDetails } from '../../../logging/errorDetails';
import { createChildExecutionContext, type ExecutionContext } from '../../../logging/executionContext';
import { findDivisionBySelection } from '../../../services/division-membership/divisionDirectory';
import { createGuildNicknameWorkflow } from '../../../services/nickname/guildNicknameWorkflow';

export function createDivisionMembershipMutationRuntime({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	return {
		findTargetUser: (discordUserId: string) => getDbUser({ discordUserId }),
		findDivision: (selection: string) => findDivisionBySelection(selection),
		listMemberships: (userId: string) =>
			divisionRepository.listMemberships({
				userId
			}),
		addMemberships: divisionRepository.addMemberships,
		removeMemberships: divisionRepository.removeMemberships,
		syncNickname: ({ targetDiscordUserId, mode }: { targetDiscordUserId: string; mode: 'add' | 'remove' }) =>
			syncDivisionMembershipNickname({
				guild,
				context,
				targetDiscordUserId,
				mode
			})
	};
}

async function syncDivisionMembershipNickname({
	guild,
	context,
	targetDiscordUserId,
	mode
}: {
	guild: Guild;
	context: ExecutionContext;
	targetDiscordUserId: string;
	mode: 'add' | 'remove';
}) {
	const memberLookup = await resolveDivisionMembershipNicknameTarget({
		guild,
		targetDiscordUserId
	});
	if ('kind' in memberLookup) {
		return memberLookup;
	}

	try {
		const nicknames = createGuildNicknameWorkflow({
			guild,
			context: createChildExecutionContext({
				context,
				bindings: {
					targetDiscordUserId,
					step: 'syncComputedNicknameAfterDivisionMembershipUpdate'
				}
			}),
			includeStaff: true
		});
		const result = await nicknames.syncNickname({
			discordUserId: targetDiscordUserId,
			setReason: mode === 'add' ? 'Staff division membership add sync' : 'Staff division membership remove sync'
		});

		return mapDivisionMembershipNicknameSyncResult(result);
	} catch (error) {
		return {
			kind: 'failed' as const,
			...toErrorDetails(error)
		};
	}
}

async function resolveDivisionMembershipNicknameTarget({ guild, targetDiscordUserId }: { guild: Guild; targetDiscordUserId: string }) {
	const memberLookup = await getGuildMember({
		guild,
		discordUserId: targetDiscordUserId
	})
		.then((member) => ({
			member
		}))
		.catch((error: unknown) => ({
			member: undefined,
			error
		}));

	if (memberLookup.member === undefined) {
		return {
			kind: 'failed' as const,
			...('error' in memberLookup && memberLookup.error ? toErrorDetails(memberLookup.error) : {})
		};
	}
	if (!memberLookup.member) {
		return {
			kind: 'member-not-found' as const
		};
	}

	return memberLookup.member;
}

function mapDivisionMembershipNicknameSyncResult(result: Awaited<ReturnType<ReturnType<typeof createGuildNicknameWorkflow>['syncNickname']>>) {
	if (result.kind !== 'synced') {
		return {
			kind: 'failed' as const,
			...('errorMessage' in result ? { errorMessage: result.errorMessage } : {}),
			...('errorName' in result ? { errorName: result.errorName } : {}),
			...('errorCode' in result ? { errorCode: result.errorCode } : {})
		};
	}
	if (result.outcome === 'updated' || result.outcome === 'unchanged') {
		return {
			kind: result.outcome,
			computedNickname: result.computedNickname
		};
	}

	return {
		kind: 'skipped' as const,
		reason: result.reason ?? 'No sync reason provided'
	};
}
