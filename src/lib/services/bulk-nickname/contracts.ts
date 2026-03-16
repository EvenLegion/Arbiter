import type { NicknameTransformMode } from '../../features/dev/nicknameTransform';

export type { BulkNicknameTarget, BulkNicknameFailure, SyncBulkNicknamesResult, TransformBulkNicknamesResult } from './bulkNicknameService';

export type SyncBulkNicknamesInput = {
	requestedDiscordUserId?: string;
	includeStaff: boolean;
};

export type TransformBulkNicknamesInput = {
	requestedDiscordUserId?: string;
	mode: NicknameTransformMode;
};

export type BulkNicknameServiceContract = {
	syncBulkNicknames: (input: SyncBulkNicknamesInput) => Promise<import('./bulkNicknameService').SyncBulkNicknamesResult>;
	transformBulkNicknames: (input: TransformBulkNicknamesInput) => Promise<import('./bulkNicknameService').TransformBulkNicknamesResult>;
};
