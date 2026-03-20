import { DISCORD_MAX_NICKNAME_LENGTH } from '../../constants';
import type { ErrorDetails } from '../../logging/errorDetails';
import { toErrorDetails } from '../../logging/errorDetails';
import { computeTransformedNickname, resolveNicknameTransformSetReason, type NicknameTransformMode } from './nicknameTransform';

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

type BulkNicknameUserDirectoryRecord = {
	id: string;
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
};

type BulkNicknameUserDirectory = {
	get: (params: { discordUserId: string }) => Promise<BulkNicknameUserDirectoryRecord | null>;
	findMany: () => Promise<BulkNicknameUserDirectoryRecord[]>;
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

export async function resolveBulkNicknameTargets(
	userDirectory: BulkNicknameUserDirectory,
	{ requestedDiscordUserId }: { requestedDiscordUserId?: string }
): Promise<BulkNicknameTarget[]> {
	if (requestedDiscordUserId) {
		const target = await userDirectory.get({
			discordUserId: requestedDiscordUserId
		});

		return target
			? [
					{
						id: target.id,
						discordUserId: target.discordUserId,
						discordUsername: target.discordUsername,
						discordNickname: target.discordNickname
					}
				]
			: [];
	}

	const users = await userDirectory.findMany();
	return users.map((user) => ({
		id: user.id,
		discordUserId: user.discordUserId,
		discordUsername: user.discordUsername,
		discordNickname: user.discordNickname
	}));
}

export async function syncBulkNicknames<TMember>(
	deps: SyncBulkNicknamesDeps<TMember>,
	input: {
		requestedDiscordUserId?: string;
		includeStaff: boolean;
	}
): Promise<SyncBulkNicknamesResult> {
	const scope = resolveBulkNicknameScope(input.requestedDiscordUserId);
	if (deps.prepare) {
		try {
			await deps.prepare();
		} catch (error) {
			return {
				kind: 'prepare_failed',
				scope,
				...toErrorDetails(error)
			};
		}
	}

	const targets = await deps.resolveTargets({
		requestedDiscordUserId: input.requestedDiscordUserId
	});
	if (targets.length === 0) {
		return {
			kind: 'no_targets',
			scope
		};
	}

	const membersByDiscordUserId = await loadMembersByDiscordUserId(deps, {
		requestedDiscordUserId: input.requestedDiscordUserId
	});

	let attempted = 0;
	let updated = 0;
	let unchanged = 0;
	let skippedStaff = 0;
	let skippedByRule = 0;
	let missingInGuild = 0;
	let failed = 0;
	const failures = [];

	for (const target of targets) {
		const member = membersByDiscordUserId.get(target.discordUserId) ?? null;
		if (!member) {
			missingInGuild++;
			continue;
		}

		attempted++;
		try {
			const result = await deps.syncNickname({
				target,
				member,
				includeStaff: input.includeStaff
			});
			if (result.outcome === 'updated') {
				updated++;
				continue;
			}
			if (result.outcome === 'unchanged') {
				unchanged++;
				continue;
			}
			if (result.reason === 'User has a staff role') {
				skippedStaff++;
				continue;
			}

			skippedByRule++;
		} catch (error) {
			failed++;
			failures.push(buildBulkNicknameFailure(target, error));
		}
	}

	return {
		kind: 'completed',
		scope,
		targetCount: targets.length,
		attempted,
		updated,
		unchanged,
		skippedStaff,
		skippedByRule,
		missingInGuild,
		failed,
		failures
	};
}

export async function transformBulkNicknames<TMember>(
	deps: TransformBulkNicknamesDeps<TMember>,
	input: {
		requestedDiscordUserId?: string;
		mode: NicknameTransformMode;
	}
): Promise<TransformBulkNicknamesResult> {
	const scope = resolveBulkNicknameScope(input.requestedDiscordUserId);
	const targets = await deps.resolveTargets({
		requestedDiscordUserId: input.requestedDiscordUserId
	});
	if (targets.length === 0) {
		return {
			kind: 'no_targets',
			scope,
			mode: input.mode
		};
	}

	const membersByDiscordUserId = await loadMembersByDiscordUserId(deps, {
		requestedDiscordUserId: input.requestedDiscordUserId
	});

	let updated = 0;
	let unchanged = 0;
	let missingInGuild = 0;
	let failed = 0;
	const failures = [];

	for (const target of targets) {
		const member = membersByDiscordUserId.get(target.discordUserId) ?? null;
		if (!member) {
			missingInGuild++;
			continue;
		}

		const currentNickname = deps.getCurrentNickname(member).trim();
		const nextNickname = computeTransformedNickname({
			mode: input.mode,
			currentNickname,
			rawNickname: target.discordNickname
		});
		if (nextNickname.length === 0) {
			failed++;
			failures.push({
				discordUserId: target.discordUserId,
				discordUsername: target.discordUsername,
				dbUserId: target.id,
				reason: 'Computed nickname was empty'
			});
			continue;
		}
		if (nextNickname.length > DISCORD_MAX_NICKNAME_LENGTH) {
			failed++;
			failures.push({
				discordUserId: target.discordUserId,
				discordUsername: target.discordUsername,
				dbUserId: target.id,
				reason: `Computed nickname length ${nextNickname.length} exceeds ${DISCORD_MAX_NICKNAME_LENGTH}`
			});
			continue;
		}
		if (nextNickname === currentNickname) {
			unchanged++;
			continue;
		}

		try {
			await deps.setNickname({
				target,
				member,
				nextNickname,
				reason: resolveNicknameTransformSetReason(input.mode)
			});
			updated++;
		} catch (error) {
			failed++;
			failures.push(buildBulkNicknameFailure(target, error));
		}
	}

	return {
		kind: 'completed',
		scope,
		mode: input.mode,
		targetCount: targets.length,
		updated,
		unchanged,
		missingInGuild,
		failed,
		failures
	};
}

async function loadMembersByDiscordUserId<TMember>(
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

function resolveBulkNicknameScope(requestedDiscordUserId?: string): BulkNicknameScope {
	return requestedDiscordUserId ? 'single' : 'all';
}

function buildBulkNicknameFailure(target: BulkNicknameTarget, error: unknown): BulkNicknameFailure {
	return {
		discordUserId: target.discordUserId,
		discordUsername: target.discordUsername,
		dbUserId: target.id,
		reason: error instanceof Error ? error.message : 'Unknown error'
	};
}
