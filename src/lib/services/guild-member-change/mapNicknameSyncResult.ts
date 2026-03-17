import type { SyncNicknameForUserResult } from '../nickname/nicknameService';

import type { GuildMemberNicknameOutcome } from './guildMemberChangeTypes';

export function mapNicknameSyncResult<TMember>(result: SyncNicknameForUserResult<TMember>): GuildMemberNicknameOutcome {
	if (result.kind !== 'synced') {
		return {
			kind: 'sync_failed',
			reason: result.kind
		};
	}
	if (result.outcome === 'skipped') {
		return {
			kind: 'skipped',
			reason: result.reason
		};
	}
	if (result.outcome === 'updated') {
		return {
			kind: 'updated',
			computedNickname: result.computedNickname
		};
	}

	return {
		kind: 'unchanged',
		computedNickname: result.computedNickname
	};
}
