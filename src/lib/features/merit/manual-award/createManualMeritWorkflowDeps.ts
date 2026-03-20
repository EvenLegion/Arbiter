import { type Guild, type GuildMember } from 'discord.js';

import { eventRepository, meritRepository, userRepository } from '../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createGuildMemberDirectMessageGateway } from '../../../services/guild-member/guildMemberDirectMessageGateway';
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
		notifyRankUp: nicknameEffects.notifyRankUp,
		sendRecipientDm: ({ discordUserId, content }: { discordUserId: string; content: string }) =>
			sendDirectMessage({
				discordUserId,
				content,
				logMessage: 'Failed to DM manual merit award to recipient'
			})
	};
}
export { mapMemberToResolvedMember } from './manualMeritMemberResolver';
