import { isNicknameTooLongError } from '../../errors/nicknameTooLongError';
import { toErrorDetails } from '../../logging/errorDetails';

import type { NicknameComputeDeps, NicknameValidationResult } from './nicknameTypes';

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
			kind: 'validation-failed',
			...toErrorDetails(error)
		};
	}
}
