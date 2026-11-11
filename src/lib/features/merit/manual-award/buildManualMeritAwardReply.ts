import type { AwardManualMeritWorkflowResult } from '../../../services/manual-merit/manualMeritService';

export function buildManualMeritAwardReply(result: Extract<AwardManualMeritWorkflowResult, { kind: 'awarded' }>) {
	const meritChangeLabel = `${formatSignedMeritAmount(result.meritAmount)} ${Math.abs(result.meritAmount) === 1 ? 'merit' : 'merits'}`;
	const eventLine = result.linkedEventName ? `\nLinked event: **${result.linkedEventName}**` : '';
	const reasonLine = result.reason ? `\nReason: ${result.reason}` : '';
	const dmLine = result.dmSent ? '\nRecipient notified via DM.' : '\nCould not DM recipient (DMs may be disabled).';
	const nicknameWarningLine = result.recipientNicknameTooLong
		? '\nNickname was not updated because the computed nickname exceeds Discord limits. Ask the user to shorten their base nickname.'
		: '';
	const badgeWarningLine = result.recipientBadgeSyncFailed ? '\nMerit badge role could not be updated. The merit was still applied.' : '';

	return `Applied **${meritChangeLabel}** (${result.meritTypeName}) to <@${result.targetDiscordUserId}>${eventLine}${reasonLine}${dmLine}${nicknameWarningLine}${badgeWarningLine}`;
}

function formatSignedMeritAmount(amount: number) {
	return amount >= 0 ? `+${amount}` : `${amount}`;
}
