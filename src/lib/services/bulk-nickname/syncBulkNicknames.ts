import { toErrorDetails } from '../../logging/errorDetails';
import type { SyncBulkNicknamesDeps, SyncBulkNicknamesResult } from './bulkNicknameTypes';
import { buildBulkNicknameFailure, loadMembersByDiscordUserId, resolveBulkNicknameScope } from './bulkNicknameShared';

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
