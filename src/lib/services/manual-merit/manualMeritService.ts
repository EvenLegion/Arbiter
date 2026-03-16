import { finalizeManualMeritNotifications } from './finalizeManualMeritNotifications';
import { type AwardManualMeritWorkflowInput, type AwardManualMeritWorkflowResult, type ManualMeritServiceDeps } from './manualMeritTypes';
import { resolveLinkedEventForManualMerit } from './resolveLinkedEventForManualMerit';
import { validateManualMeritRequest } from './validateManualMeritRequest';

export type {
	AwardManualMeritWorkflowInput,
	AwardManualMeritWorkflowResult,
	ManualMeritServiceDeps,
	ResolvedManualMeritMember
} from './manualMeritTypes';

export async function awardManualMeritWorkflow(
	deps: ManualMeritServiceDeps,
	input: AwardManualMeritWorkflowInput
): Promise<AwardManualMeritWorkflowResult> {
	const validationResult = await validateManualMeritRequest({
		resolveTargetMember: deps.resolveTargetMember,
		input
	});
	if ('kind' in validationResult) {
		return validationResult;
	}

	const { targetMember, awarderMember, meritTypeCode } = validationResult;

	const targetDbUser = await deps.upsertUser({
		discordUserId: targetMember.discordUserId,
		discordUsername: targetMember.discordUsername,
		discordNickname: targetMember.discordGlobalName ?? targetMember.discordUsername,
		discordAvatarUrl: targetMember.discordAvatarUrl
	});
	const awarderDbUser = await deps.upsertUser({
		discordUserId: awarderMember.discordUserId,
		discordUsername: awarderMember.discordUsername,
		discordNickname: awarderMember.discordGlobalName ?? awarderMember.discordUsername,
		discordAvatarUrl: awarderMember.discordAvatarUrl
	});

	const linkedEventResult = await resolveLinkedEventForManualMerit({
		findLinkedEvent: deps.findLinkedEvent,
		linkedEventSessionId: input.linkedEventSessionId
	});
	if ('kind' in linkedEventResult) {
		return linkedEventResult;
	}
	const { linkedEvent } = linkedEventResult;

	let award: Awaited<ReturnType<ManualMeritServiceDeps['awardManualMerit']>>;
	try {
		award = await deps.awardManualMerit({
			recipientDbUserId: targetDbUser.id,
			awardedByDbUserId: awarderDbUser.id,
			meritTypeCode,
			reason: input.reason,
			eventSessionId: linkedEvent?.id ?? null
		});
	} catch (error) {
		if (isMeritTypeNotManualAwardableError(error)) {
			return {
				kind: 'merit_type_not_manual_awardable'
			};
		}

		throw error;
	}

	const notifications = await finalizeManualMeritNotifications({
		deps,
		targetMember,
		awarderMember,
		targetDbUserId: targetDbUser.id,
		meritAmount: award.meritType.meritAmount,
		linkedEventName: linkedEvent?.name ?? null,
		reason: input.reason
	});

	return {
		kind: 'awarded',
		meritRecordId: award.id,
		targetDiscordUserId: targetMember.discordUserId,
		meritTypeCode: award.meritType.code,
		meritTypeName: award.meritType.name,
		meritAmount: award.meritType.meritAmount,
		linkedEventName: linkedEvent?.name ?? null,
		reason: input.reason,
		dmSent: notifications.dmSent,
		recipientNicknameTooLong: notifications.recipientNicknameTooLong
	};
}

function isMeritTypeNotManualAwardableError(error: unknown) {
	return error instanceof Error && error.name === 'MeritTypeNotManualAwardableError';
}
