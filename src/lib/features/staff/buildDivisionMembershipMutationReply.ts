import type { DivisionMembershipMutationResult } from '../../services/division-membership/divisionMembershipService';

export function buildDivisionMembershipMutationReply({ result, requestId }: { result: DivisionMembershipMutationResult; requestId: string }) {
	if (result.kind === 'target_user_not_found') {
		return `Selected user is not present in the User table. requestId=\`${requestId}\``;
	}
	if (result.kind === 'division_not_found') {
		return `Selected division was not found. Choose a division from autocomplete. requestId=\`${requestId}\``;
	}
	if (result.kind === 'membership_exists') {
		return `<@${result.targetDiscordUserId}> already has the **${result.divisionName}** division membership. requestId=\`${requestId}\``;
	}
	if (result.kind === 'membership_missing') {
		return `<@${result.targetDiscordUserId}> does not have the **${result.divisionName}** division membership. requestId=\`${requestId}\``;
	}

	const baseContent =
		result.mode === 'add'
			? `Added **${result.divisionName}** to <@${result.targetDiscordUserId}>. Database membership updated.`
			: `Removed **${result.divisionName}** from <@${result.targetDiscordUserId}>. Database membership updated.`;

	switch (result.nicknameSync.kind) {
		case 'not_requested':
			return `${baseContent} Nickname sync skipped by option. requestId=\`${requestId}\``;
		case 'guild-unavailable':
			return `${baseContent} Nickname sync failed because the guild could not be resolved. requestId=\`${requestId}\``;
		case 'member-not-found':
			return `${baseContent} Nickname sync skipped because the user is not in the guild. requestId=\`${requestId}\``;
		case 'failed':
			return `${baseContent} Nickname sync failed. requestId=\`${requestId}\``;
		case 'updated':
			return `${baseContent} Nickname synced to \`${result.nicknameSync.computedNickname}\`. requestId=\`${requestId}\``;
		case 'unchanged':
			return `${baseContent} Nickname already matched \`${result.nicknameSync.computedNickname}\`. requestId=\`${requestId}\``;
		case 'skipped':
			return `${baseContent} Nickname sync skipped: ${result.nicknameSync.reason}. requestId=\`${requestId}\``;
	}
}
