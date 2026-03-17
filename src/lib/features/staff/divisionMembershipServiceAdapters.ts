import { getConfiguredGuild } from '../../discord/configuredGuildGateway';
import { getGuildMember } from '../../discord/guildMemberGateway';
import { getDbUser } from '../../discord/userDirectoryGateway';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { resolveDivisionSelection } from '../division-selection/divisionDirectory';
import { createGuildNicknameWorkflowGateway } from '../guild-member/guildNicknameWorkflowGateway';
import { createDivisionMembershipPersistenceGateway } from './divisionMembershipPersistenceGateway';

export function createDivisionMembershipMutationDeps({ context }: { context: ExecutionContext }) {
	const persistence = createDivisionMembershipPersistenceGateway();

	return {
		findTargetUser: (discordUserId: string) => getDbUser({ discordUserId }),
		findDivision: (selection: string) =>
			resolveDivisionSelection({
				value: selection
			}),
		...persistence,
		syncNickname: async ({ targetDiscordUserId, mode }: { targetDiscordUserId: string; mode: 'add' | 'remove' }) => {
			const guild = await getConfiguredGuild().catch(() => null);
			if (!guild) {
				return {
					kind: 'guild-unavailable' as const
				};
			}

			const member = await getGuildMember({
				guild,
				discordUserId: targetDiscordUserId
			}).catch(() => undefined);
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
