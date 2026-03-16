export type {
	NicknameComputeResult,
	NicknameSyncResult,
	NicknameValidationResult,
	ComputeNicknameForUserResult,
	SyncNicknameForUserResult
} from './nicknameService';

export type ValidateRequestedNicknameInput = {
	discordUserId: string;
	requestedName: string;
	contextBindings?: Record<string, unknown>;
};

export type ComputeNicknameForUserInput = {
	discordUserId: string;
	totalMeritsOverride?: number;
	contextBindings?: Record<string, unknown>;
};

export type SyncNicknameForUserInput = {
	discordUserId: string;
	setReason: string;
	totalMeritsOverride?: number;
	contextBindings?: Record<string, unknown>;
};

export type NicknameLookupGateway<TMember> = {
	getMember: (discordUserId: string) => Promise<TMember | null>;
};

export type NicknameComputeGateway<TMember> = NicknameLookupGateway<TMember> & {
	computeNickname: (params: {
		member: TMember;
		baseDiscordNicknameOverride?: string;
		totalMeritsOverride?: number;
		contextBindings?: Record<string, unknown>;
	}) => Promise<import('./nicknameService').NicknameComputeResult>;
};

export type NicknameSyncGateway<TMember> = NicknameLookupGateway<TMember> & {
	syncComputedNickname: (params: {
		member: TMember;
		setReason: string;
		totalMeritsOverride?: number;
		contextBindings?: Record<string, unknown>;
	}) => Promise<import('./nicknameService').NicknameSyncResult<TMember>>;
};

export type NicknameServiceContract<TMember> = {
	validateRequestedNickname: (
		deps: NicknameComputeGateway<TMember>,
		input: ValidateRequestedNicknameInput
	) => Promise<import('./nicknameService').NicknameValidationResult>;
	computeNicknameForUser: (
		deps: NicknameComputeGateway<TMember>,
		input: ComputeNicknameForUserInput
	) => Promise<import('./nicknameService').ComputeNicknameForUserResult>;
	syncNicknameForUser: (
		deps: NicknameSyncGateway<TMember>,
		input: SyncNicknameForUserInput
	) => Promise<import('./nicknameService').SyncNicknameForUserResult<TMember>>;
};
