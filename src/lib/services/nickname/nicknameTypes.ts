import type { ErrorDetails } from '../../logging/errorDetails';

export type NicknameComputeResult = {
	computedNickname: string | null;
	reason: string | undefined;
};

export type NicknameSyncResult<TMember> =
	| {
			outcome: 'skipped';
			member: TMember;
			computedNickname: null;
			reason: string | undefined;
	  }
	| {
			outcome: 'unchanged' | 'updated';
			member: TMember;
			computedNickname: string;
			reason?: undefined;
	  };

export type NicknameLookupDeps<TMember> = {
	getMember: (discordUserId: string) => Promise<TMember | null>;
};

export type NicknameComputeDeps<TMember> = NicknameLookupDeps<TMember> & {
	computeNickname: (params: {
		member: TMember;
		baseDiscordNicknameOverride?: string;
		totalMeritsOverride?: number;
		contextBindings?: Record<string, unknown>;
	}) => Promise<NicknameComputeResult>;
};

export type NicknameSyncDeps<TMember> = NicknameLookupDeps<TMember> & {
	syncComputedNickname: (params: {
		member: TMember;
		setReason: string;
		totalMeritsOverride?: number;
		contextBindings?: Record<string, unknown>;
	}) => Promise<NicknameSyncResult<TMember>>;
};

export type NicknameValidationResult =
	| { kind: 'valid' }
	| { kind: 'member-not-found' }
	| { kind: 'nickname-too-long' }
	| ({ kind: 'validation-failed' } & ErrorDetails);

export type ComputeNicknameForUserResult =
	| { kind: 'computed'; computedNickname: string | null; reason?: string }
	| { kind: 'member-not-found' }
	| ({ kind: 'compute-failed' } & ErrorDetails);

export type SyncNicknameForUserResult<TMember> =
	| { kind: 'member-not-found' }
	| { kind: 'nickname-too-long' }
	| ({ kind: 'sync-failed' } & ErrorDetails)
	| ({ kind: 'synced' } & NicknameSyncResult<TMember>);
