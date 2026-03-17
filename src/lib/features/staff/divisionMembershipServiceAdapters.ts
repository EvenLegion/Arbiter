import { getConfiguredGuild } from '../../discord/configuredGuildGateway';
import { getGuildMember } from '../../discord/guildMemberGateway';
import { getDbUser } from '../../discord/userDirectoryGateway';
import { toErrorDetails } from '../../logging/errorDetails';
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
			const guildLookup = await getConfiguredGuild()
				.then((resolvedGuild) => ({
					guild: resolvedGuild
				}))
				.catch((error: unknown) => ({
					guild: null,
					error
				}));
			const guild = guildLookup.guild;
			if (!guild) {
				return {
					kind: 'guild-unavailable' as const,
					...('error' in guildLookup && guildLookup.error ? toErrorDetails(guildLookup.error) : {})
				};
			}

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
