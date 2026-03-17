import { isNicknameTooLongError } from '../../errors/nicknameTooLongError';
import { toErrorDetails } from '../../logging/errorDetails';

import type { NicknameSyncDeps, SyncNicknameForUserResult } from './nicknameTypes';

export async function syncNicknameForUser<TMember>(
	deps: NicknameSyncDeps<TMember>,
	input: {
		discordUserId: string;
		setReason: string;
		totalMeritsOverride?: number;
		contextBindings?: Record<string, unknown>;
	}
): Promise<SyncNicknameForUserResult<TMember>> {
	const member = await deps.getMember(input.discordUserId);
	if (!member) {
		return {
			kind: 'member-not-found'
		};
	}

	try {
		const result = await deps.syncComputedNickname({
			member,
			setReason: input.setReason,
			totalMeritsOverride: input.totalMeritsOverride,
			contextBindings: input.contextBindings
		});

		return {
			kind: 'synced',
			...result
		};
	} catch (error) {
		if (isNicknameTooLongError(error)) {
			return {
				kind: 'nickname-too-long'
			};
		}

		return {
			kind: 'sync-failed',
			...toErrorDetails(error)
		};
	}
}
