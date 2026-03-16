import type { BulkNicknameFailure, BulkNicknameResolutionDeps, BulkNicknameScope, BulkNicknameTarget } from './bulkNicknameTypes';

export async function loadMembersByDiscordUserId<TMember>(
	deps: BulkNicknameResolutionDeps<TMember>,
	input: {
		requestedDiscordUserId?: string;
	}
) {
	if (input.requestedDiscordUserId) {
		const member = await deps.getMember(input.requestedDiscordUserId);
		if (!member) {
			return new Map<string, TMember>();
		}

		return new Map([[input.requestedDiscordUserId, member]]);
	}

	return deps.listMembers();
}

export function resolveBulkNicknameScope(requestedDiscordUserId?: string): BulkNicknameScope {
	return requestedDiscordUserId ? 'single' : 'all';
}

export function buildBulkNicknameFailure(target: BulkNicknameTarget, error: unknown): BulkNicknameFailure {
	return {
		discordUserId: target.discordUserId,
		discordUsername: target.discordUsername,
		dbUserId: target.id,
		reason: error instanceof Error ? error.message : 'Unknown error'
	};
}
