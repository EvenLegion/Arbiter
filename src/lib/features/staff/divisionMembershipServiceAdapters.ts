import { container } from '@sapphire/framework';

import { divisionRepository } from '../../../integrations/prisma/repositories';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { syncNicknameForUser } from '../../services/nickname/nicknameService';
import { resolveDivisionSelection } from '../division-selection/divisionDirectory';
import { createGuildNicknameServiceDeps } from '../guild-member/nicknameServiceAdapters';

export function createDivisionMembershipMutationDeps({ context }: { context: ExecutionContext }) {
	return {
		findTargetUser: (discordUserId: string) =>
			container.utilities.userDirectory.get({
				discordUserId
			}),
		findDivision: (selection: string) =>
			resolveDivisionSelection({
				value: selection
			}),
		listMemberships: (userId: string) =>
			divisionRepository.listMemberships({
				userId
			}),
		addMemberships: divisionRepository.addMemberships,
		removeMemberships: divisionRepository.removeMemberships,
		syncNickname: async ({ targetDiscordUserId, mode }: { targetDiscordUserId: string; mode: 'add' | 'remove' }) => {
			const guild = await container.utilities.guild.getOrThrow().catch(() => null);
			if (!guild) {
				return {
					kind: 'guild-unavailable' as const
				};
			}

			const member = await container.utilities.member
				.get({
					guild,
					discordUserId: targetDiscordUserId
				})
				.catch(() => undefined);
			if (member === undefined) {
				return {
					kind: 'failed' as const
				};
			}
			if (!member) {
				return {
					kind: 'member-not-found' as const
				};
			}

			try {
				const result = await syncNicknameForUser(
					createGuildNicknameServiceDeps({
						guild,
						context: createChildExecutionContext({
							context,
							bindings: {
								targetDiscordUserId,
								step: 'syncComputedNicknameAfterDivisionMembershipUpdate'
							}
						}),
						includeStaff: true
					}),
					{
						discordUserId: targetDiscordUserId,
						setReason: mode === 'add' ? 'Staff division membership add sync' : 'Staff division membership remove sync'
					}
				);
				if (result.kind !== 'synced') {
					return {
						kind: 'failed' as const
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
			} catch {
				return {
					kind: 'failed' as const
				};
			}
		}
	};
}
