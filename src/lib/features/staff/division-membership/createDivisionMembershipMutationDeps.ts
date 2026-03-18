import type { Guild } from 'discord.js';

import { divisionRepository } from '../../../../integrations/prisma/repositories';
import { getGuildMember } from '../../../discord/guild/guildMembers';
import { getDbUser } from '../../../discord/guild/users';
import { toErrorDetails } from '../../../logging/errorDetails';
import { createChildExecutionContext, type ExecutionContext } from '../../../logging/executionContext';
import { findDivisionBySelection } from '../../../services/division-membership/divisionDirectory';
import { createGuildNicknameWorkflowGateway } from '../../../services/nickname/createGuildNicknameWorkflowGateway';

export function createDivisionMembershipMutationDeps({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	return {
		findTargetUser: (discordUserId: string) => getDbUser({ discordUserId }),
		findDivision: (selection: string) => findDivisionBySelection(selection),
		listMemberships: (userId: string) =>
			divisionRepository.listMemberships({
				userId
			}),
		addMemberships: divisionRepository.addMemberships,
		removeMemberships: divisionRepository.removeMemberships,
		syncNickname: async ({ targetDiscordUserId, mode }: { targetDiscordUserId: string; mode: 'add' | 'remove' }) => {
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
			const member = memberLookup.member;
			if (member === undefined) {
				return {
					kind: 'failed' as const,
					...('error' in memberLookup && memberLookup.error ? toErrorDetails(memberLookup.error) : {})
				};
			}
			if (!member) {
				return {
					kind: 'member-not-found' as const
				};
			}

			try {
				const nicknames = createGuildNicknameWorkflowGateway({
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
			} catch (error) {
				return {
					kind: 'failed' as const,
					...toErrorDetails(error)
				};
			}
		}
	};
}
