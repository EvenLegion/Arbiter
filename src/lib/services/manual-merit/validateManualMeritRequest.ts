import { MeritTypeCode } from '@prisma/client';
import { z } from 'zod';

import type { AwardManualMeritWorkflowInput, AwardManualMeritWorkflowResult, ResolvedManualMeritMember } from './manualMeritTypes';

const PLAYER_DISCORD_USER_ID_SCHEMA = z.string().trim().min(1);
const MANUAL_MERIT_TYPE_CODE_SCHEMA = z.enum(MeritTypeCode);

export async function validateManualMeritRequest({
	resolveTargetMember,
	input
}: {
	resolveTargetMember: (playerInput: string) => Promise<ResolvedManualMeritMember | null>;
	input: AwardManualMeritWorkflowInput;
}): Promise<
	| AwardManualMeritWorkflowResult
	| {
			targetMember: ResolvedManualMeritMember;
			awarderMember: ResolvedManualMeritMember;
			meritTypeCode: MeritTypeCode;
	  }
> {
	if (!input.actor.capabilities.isStaff) {
		return {
			kind: 'forbidden'
		};
	}

	const parsedPlayerInput = PLAYER_DISCORD_USER_ID_SCHEMA.safeParse(input.playerInput);
	if (!parsedPlayerInput.success) {
		return {
			kind: 'invalid_player_selection'
		};
	}

	const parsedMeritTypeCode = MANUAL_MERIT_TYPE_CODE_SCHEMA.safeParse(input.rawMeritTypeCode);
	if (!parsedMeritTypeCode.success) {
		return {
			kind: 'invalid_merit_type'
		};
	}

	const targetMember = await resolveTargetMember(parsedPlayerInput.data);
	if (!targetMember || targetMember.isBot) {
		return {
			kind: 'target_not_found'
		};
	}

	if (!input.actorMember) {
		return {
			kind: 'awarder_not_found'
		};
	}

	return {
		targetMember,
		awarderMember: input.actorMember,
		meritTypeCode: parsedMeritTypeCode.data
	};
}
