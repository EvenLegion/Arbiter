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

/** Stops a run in time to edit the interaction reply, which expires after 15 minutes. Same limits as the badge bulk sync. */
export const BULK_NICKNAME_SYNC_DEADLINE_MS = 12 * 60_000;
/** Pause after each nickname a live run changes. discord.js still queues any rate limit. */
export const BULK_NICKNAME_SYNC_PACE_MS = 1_000;
/** A rate-limit wait at least this long counts toward stopping the run. */
export const BULK_NICKNAME_SYNC_LONG_RATE_LIMIT_WAIT_MS = 10_000;
/** The run stops, between members, after this many long rate-limit waits. */
export const BULK_NICKNAME_SYNC_MAX_LONG_RATE_LIMIT_WAITS = 3;

export type BulkNicknameSyncStopReason = 'deadline' | 'rate_limited';

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
	syncNickname: (params: { target: BulkNicknameTarget; member: TMember; includeStaff: boolean; dryRun: boolean }) => Promise<{
		outcome: 'updated' | 'unchanged' | 'skipped';
		reason?: string;
		/** The member's Discord nickname before the sync; null when they have none. */
		currentNickname?: string | null;
		computedNickname?: string | null;
	}>;
	/** Calls `onWait` with each Discord rate-limit wait (ms); returns an unsubscribe function. */
	watchRateLimits?: (onWait: (waitMs: number) => void) => () => void;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
	deadlineMs?: number;
	paceMs?: number;
	longRateLimitWaitMs?: number;
	maxLongRateLimitWaits?: number;
};

/**
 * One dry-run row: a nickname a live run would change, a staff member it would skip, or a member it
 * would fail on. Holds nicknames, so it belongs only in the ephemeral reply and its attachment, never in logs.
 */
export type BulkNicknamePlanEntry = {
	discordUserId: string;
	discordUsername: string;
	action: 'change' | 'skipped_staff' | 'failed';
	currentNickname: string | null;
	plannedNickname: string | null;
	reason: string | null;
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
			/** Set when the run stopped early; `remaining` targets were not processed. Run the command again to continue. */
			stopReason: BulkNicknameSyncStopReason | null;
			remaining: number;
			rateLimitWaits: number;
			attempted: number;
			updated: number;
			unchanged: number;
			skippedStaff: number;
			skippedByRule: number;
			missingInGuild: number;
			failed: number;
			failures: BulkNicknameFailure[];
			dryRun: boolean;
			/** Filled only on a dry run. */
			plan: BulkNicknamePlanEntry[];
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
		dryRun?: boolean;
	}
): Promise<SyncBulkNicknamesResult> {
	const dryRun = input.dryRun ?? false;
	const scope = resolveBulkNicknameScope(input.requestedDiscordUserId);
	const now = deps.now ?? Date.now;
	const sleep = deps.sleep ?? defaultSleep;
	const deadlineMs = deps.deadlineMs ?? BULK_NICKNAME_SYNC_DEADLINE_MS;
	const paceMs = deps.paceMs ?? BULK_NICKNAME_SYNC_PACE_MS;
	const longWaitMs = deps.longRateLimitWaitMs ?? BULK_NICKNAME_SYNC_LONG_RATE_LIMIT_WAIT_MS;
	const maxLongWaits = deps.maxLongRateLimitWaits ?? BULK_NICKNAME_SYNC_MAX_LONG_RATE_LIMIT_WAITS;
	const startedAt = now();
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
	const plan: BulkNicknamePlanEntry[] = [];
	let processed = 0;
	let rateLimitWaits = 0;
	let longRateLimitWaits = 0;
	let stopReason: BulkNicknameSyncStopReason | null = null;
	const unsubscribe =
		deps.watchRateLimits?.((waitMs) => {
			rateLimitWaits++;
			if (waitMs >= longWaitMs) {
				longRateLimitWaits++;
			}
		}) ?? (() => undefined);

	try {
		for (const [index, target] of targets.entries()) {
			if (longRateLimitWaits >= maxLongWaits) {
				stopReason = 'rate_limited';
				break;
			}
			if (now() - startedAt >= deadlineMs) {
				stopReason = 'deadline';
				break;
			}

			processed++;
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
					includeStaff: input.includeStaff,
					dryRun
				});
				if (result.outcome === 'updated') {
					updated++;
					if (dryRun) {
						plan.push(buildPlanEntry(target, 'change', result));
					} else if (index < targets.length - 1) {
						await sleep(paceMs);
					}
					continue;
				}
				if (result.outcome === 'unchanged') {
					unchanged++;
					continue;
				}
				if (result.reason === 'User has a staff role') {
					skippedStaff++;
					if (dryRun) {
						plan.push(buildPlanEntry(target, 'skipped_staff', result));
					}
					continue;
				}

				skippedByRule++;
			} catch (error) {
				failed++;
				const failure = buildBulkNicknameFailure(target, error);
				failures.push(failure);
				if (dryRun) {
					plan.push({ ...buildPlanEntry(target, 'failed', {}), reason: failure.reason });
				}
			}
		}
	} finally {
		unsubscribe();
	}

	return {
		kind: 'completed',
		scope,
		targetCount: targets.length,
		stopReason,
		remaining: targets.length - processed,
		rateLimitWaits,
		attempted,
		updated,
		unchanged,
		skippedStaff,
		skippedByRule,
		missingInGuild,
		failed,
		failures,
		dryRun,
		plan
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

function buildPlanEntry(
	target: BulkNicknameTarget,
	action: BulkNicknamePlanEntry['action'],
	result: { currentNickname?: string | null; computedNickname?: string | null }
): BulkNicknamePlanEntry {
	return {
		discordUserId: target.discordUserId,
		discordUsername: target.discordUsername,
		action,
		currentNickname: result.currentNickname ?? null,
		plannedNickname: action === 'change' ? (result.computedNickname ?? null) : null,
		reason: null
	};
}

function buildBulkNicknameFailure(target: BulkNicknameTarget, error: unknown): BulkNicknameFailure {
	return {
		discordUserId: target.discordUserId,
		discordUsername: target.discordUsername,
		dbUserId: target.id,
		reason: error instanceof Error ? error.message : 'Unknown error'
	};
}

function defaultSleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
