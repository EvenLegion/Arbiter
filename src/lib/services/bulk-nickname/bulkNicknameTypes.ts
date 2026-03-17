import type { NicknameTransformMode } from '../../features/dev/nicknameTransform';
import type { ErrorDetails } from '../../logging/errorDetails';

export type BulkNicknameTarget = {
	id: string;
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
};

export type BulkNicknameFailure = {
	discordUserId: string;
	discordUsername: string;
	dbUserId: string;
	reason: string;
};

export type BulkNicknameResolutionDeps<TMember> = {
	resolveTargets: (params: { requestedDiscordUserId?: string }) => Promise<BulkNicknameTarget[]>;
	getMember: (discordUserId: string) => Promise<TMember | null>;
	listMembers: () => Promise<Map<string, TMember>>;
};

export type SyncBulkNicknamesDeps<TMember> = BulkNicknameResolutionDeps<TMember> & {
	prepare?: () => Promise<void>;
	syncNickname: (params: { target: BulkNicknameTarget; member: TMember; includeStaff: boolean }) => Promise<{
		outcome: 'updated' | 'unchanged' | 'skipped';
		reason?: string;
	}>;
};

export type TransformBulkNicknamesDeps<TMember> = BulkNicknameResolutionDeps<TMember> & {
	getCurrentNickname: (member: TMember) => string;
	setNickname: (params: { target: BulkNicknameTarget; member: TMember; nextNickname: string; reason: string }) => Promise<void>;
};

export type BulkNicknameScope = 'single' | 'all';

export type SyncBulkNicknamesResult =
	| ({
			kind: 'prepare_failed';
			scope: BulkNicknameScope;
	  } & ErrorDetails)
	| {
			kind: 'no_targets';
			scope: BulkNicknameScope;
	  }
	| {
			kind: 'completed';
			scope: BulkNicknameScope;
			targetCount: number;
			attempted: number;
			updated: number;
			unchanged: number;
			skippedStaff: number;
			skippedByRule: number;
			missingInGuild: number;
			failed: number;
			failures: BulkNicknameFailure[];
	  };

export type TransformBulkNicknamesResult =
	| {
			kind: 'no_targets';
			scope: BulkNicknameScope;
			mode: NicknameTransformMode;
	  }
	| {
			kind: 'completed';
			scope: BulkNicknameScope;
			mode: NicknameTransformMode;
			targetCount: number;
			updated: number;
			unchanged: number;
			missingInGuild: number;
			failed: number;
			failures: BulkNicknameFailure[];
	  };
