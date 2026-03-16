import { isNicknameTooLongError } from '../../errors/nicknameTooLongError';

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

type NicknameLookupDeps<TMember> = {
	getMember: (discordUserId: string) => Promise<TMember | null>;
};

type NicknameComputeDeps<TMember> = NicknameLookupDeps<TMember> & {
	computeNickname: (params: {
		member: TMember;
		baseDiscordNicknameOverride?: string;
		totalMeritsOverride?: number;
		contextBindings?: Record<string, unknown>;
	}) => Promise<NicknameComputeResult>;
};

type NicknameSyncDeps<TMember> = NicknameLookupDeps<TMember> & {
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
	| { kind: 'validation-failed' };

export type ComputeNicknameForUserResult =
	| { kind: 'computed'; computedNickname: string | null; reason?: string }
	| { kind: 'member-not-found' }
	| { kind: 'compute-failed' };

export type SyncNicknameForUserResult<TMember> =
	| { kind: 'member-not-found' }
	| { kind: 'nickname-too-long' }
	| { kind: 'sync-failed' }
	| ({ kind: 'synced' } & NicknameSyncResult<TMember>);

export async function validateRequestedNickname<TMember>(
	deps: NicknameComputeDeps<TMember>,
	input: {
		discordUserId: string;
		requestedName: string;
		contextBindings?: Record<string, unknown>;
	}
): Promise<NicknameValidationResult> {
	const member = await deps.getMember(input.discordUserId);
	if (!member) {
		return {
			kind: 'member-not-found'
		};
	}

	try {
		await deps.computeNickname({
			member,
			baseDiscordNicknameOverride: input.requestedName,
			contextBindings: input.contextBindings
		});

		return {
			kind: 'valid'
		};
	} catch (error) {
		if (isNicknameTooLongError(error)) {
			return {
				kind: 'nickname-too-long'
			};
		}

		return {
			kind: 'validation-failed'
		};
	}
}

export async function computeNicknameForUser<TMember>(
	deps: NicknameComputeDeps<TMember>,
	input: {
		discordUserId: string;
		totalMeritsOverride?: number;
		contextBindings?: Record<string, unknown>;
	}
): Promise<ComputeNicknameForUserResult> {
	const member = await deps.getMember(input.discordUserId);
	if (!member) {
		return {
			kind: 'member-not-found'
		};
	}

	try {
		const result = await deps.computeNickname({
			member,
			totalMeritsOverride: input.totalMeritsOverride,
			contextBindings: input.contextBindings
		});

		return {
			kind: 'computed',
			computedNickname: result.computedNickname,
			reason: result.reason
		};
	} catch {
		return {
			kind: 'compute-failed'
		};
	}
}

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
			kind: 'sync-failed'
		};
	}
}
