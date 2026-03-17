import type { ComputeNicknameForUserResult, NicknameComputeDeps } from './nicknameTypes';

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
