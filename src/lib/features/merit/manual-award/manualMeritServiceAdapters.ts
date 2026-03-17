import { type Guild, type GuildMember } from 'discord.js';

import { meritRepository, userRepository } from '../../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createManualMeritLinkedEventGateway } from './manualMeritLinkedEventGateway';
import { createManualMeritDirectMessageGateway } from './manualMeritDirectMessageGateway';
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
	const messages = createManualMeritDirectMessageGateway({
		guild,
		logger
	});
	const findLinkedEvent = createManualMeritLinkedEventGateway();

	return {
		resolveTargetMember: members.resolveTargetMember,
		upsertUser: userRepository.upsert,
		findLinkedEvent,
		awardManualMerit: meritRepository.awardManualMerit,
		syncRecipientNickname: nicknameEffects.syncRecipientNickname,
		computeAwarderNickname: nicknameEffects.computeAwarderNickname,
		getRecipientTotalMerits: ({ userDbUserId }: { userDbUserId: string }) =>
			meritRepository.getUserTotalMerits({
				userDbUserId
			}),
		notifyRankUp: nicknameEffects.notifyRankUp,
		sendRecipientDm: messages.sendRecipientDm
	};
}
export { mapMemberToResolvedMember } from './manualMeritMemberResolver';
