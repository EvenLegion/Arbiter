import { buildManualMeritDmContent } from './buildManualMeritDmContent';
import type { ManualMeritServiceDeps, ResolvedManualMeritMember } from './manualMeritTypes';

export async function finalizeManualMeritNotifications({
	deps,
	targetMember,
	awarderMember,
	targetDbUserId,
	meritAmount,
	linkedEventName,
	reason
}: {
	deps: Pick<
		ManualMeritServiceDeps,
		'syncRecipientNickname' | 'computeAwarderNickname' | 'getRecipientTotalMerits' | 'notifyRankUp' | 'sendRecipientDm'
	>;
	targetMember: ResolvedManualMeritMember;
	awarderMember: ResolvedManualMeritMember;
	targetDbUserId: string;
	meritAmount: number;
	linkedEventName: string | null;
	reason: string | null;
}) {
	const syncNicknameResult = await deps.syncRecipientNickname({
		discordUserId: targetMember.discordUserId
	});
	const recipientNicknameTooLong = syncNicknameResult === 'nickname-too-long';

	const awarderNicknameForDm =
		(await deps.computeAwarderNickname({
			discordUserId: awarderMember.discordUserId
		})) ?? awarderMember.discordDisplayName;

	const currentTotalMerits = await deps.getRecipientTotalMerits({
		userDbUserId: targetDbUserId
	});
	const previousTotalMerits = Math.max(0, currentTotalMerits - meritAmount);
	await deps.notifyRankUp({
		discordUserId: targetMember.discordUserId,
		previousTotalMerits,
		currentTotalMerits
	});

	const dmSent = await deps.sendRecipientDm({
		discordUserId: targetMember.discordUserId,
		content: buildManualMeritDmContent({
			meritAmount,
			linkedEventName,
			reason,
			awarderNickname: awarderNicknameForDm
		})
	});

	return {
		dmSent,
		recipientNicknameTooLong
	};
}
