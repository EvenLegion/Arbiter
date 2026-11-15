import { type Guild, type GuildMember } from 'discord.js';

import { ENV_MERIT_BADGE_ROLES } from '../../../../config/env/discord';
import { eventRepository, meritRepository, userRepository } from '../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createGuildMemberDirectMessageGateway } from '../../../services/guild-member/guildMemberDirectMessageGateway';
import { createMeritBadgeSyncRuntime } from '../../../services/merit-badge/createMeritBadgeSyncRuntime';
import { createManualMeritMemberResolver } from './manualMeritMemberResolver';
import { createManualMeritNicknameEffects } from './manualMeritNicknameEffects';

export function createManualMeritWorkflowDeps({
	guild,
	awarderMember,
	context,
	logger
}: {
	guild: Guild;
	awarderMember: GuildMember;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	const members = createManualMeritMemberResolver({
		guild,
		awarderMember
	});
	const nicknameEffects = createManualMeritNicknameEffects({
		guild,
		context,
		logger,
		resolveMember: members.getMember
	});
	const badges = createMeritBadgeSyncRuntime({
		guild,
		context,
		auditReason: 'Merit badge sync after manual merit'
	});
	const sendDirectMessage = createGuildMemberDirectMessageGateway({
		guild,
		logger
	});

	return {
		resolveTargetMember: members.resolveTargetMember,
		upsertUser: userRepository.upsert,
		findLinkedEvent: async (eventSessionId: number) => {
			const linkedEvent = await eventRepository.getSession({
				eventSessionId
			});
			if (!linkedEvent) {
				return null;
			}

			return {
				id: linkedEvent.id,
				name: linkedEvent.name,
				createdAt: linkedEvent.createdAt
			};
		},
		awardManualMerit: meritRepository.awardManualMerit,
		syncRecipientNickname: nicknameEffects.syncRecipientNickname,
		computeAwarderNickname: nicknameEffects.computeAwarderNickname,
		getRecipientTotalMerits: ({ userDbUserId }: { userDbUserId: string }) =>
			meritRepository.getUserTotalMerits({
				userDbUserId
			}),
		syncRecipientBadge: async ({ discordUserId, totalMerits }: { discordUserId: string; totalMerits: number }) => {
			// The runtime logs the failure details.
			const result = await badges.syncMember({
				discordUserId,
				totalMeritsOverride: totalMerits
			});
			return result.kind === 'failed' ? ('failed' as const) : ('ok' as const);
		},
		notifyRankUp: nicknameEffects.notifyRankUp,
		sendRecipientDm: ({ discordUserId, content }: { discordUserId: string; content: string }) =>
			sendDirectMessage({
				discordUserId,
				content,
				logMessage: 'Failed to DM manual merit award to recipient'
			}),
		badgeRoles: ENV_MERIT_BADGE_ROLES
	};
}
export { mapMemberToResolvedMember } from './manualMeritMemberResolver';
