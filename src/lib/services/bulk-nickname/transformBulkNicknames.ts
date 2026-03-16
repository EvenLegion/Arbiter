import { DISCORD_MAX_NICKNAME_LENGTH } from '../../constants';
import { computeTransformedNickname, resolveNicknameTransformSetReason, type NicknameTransformMode } from '../../features/dev/nicknameTransform';
import type { TransformBulkNicknamesDeps, TransformBulkNicknamesResult } from './bulkNicknameTypes';
import { buildBulkNicknameFailure, loadMembersByDiscordUserId, resolveBulkNicknameScope } from './bulkNicknameShared';

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
