import { MeritTypeCode } from '@prisma/client';
import { z } from 'zod';

import type { ActorContext } from '../_shared/actor';

const PLAYER_DISCORD_USER_ID_SCHEMA = z.string().trim().min(1);
const MANUAL_MERIT_TYPE_CODE_SCHEMA = z.enum(MeritTypeCode);

export type ResolvedManualMeritMember = {
	discordUserId: string;
	discordUsername: string;
	discordDisplayName: string;
	discordGlobalName: string | null;
	discordAvatarUrl: string;
	isBot: boolean;
};

export type ManualMeritServiceDeps = {
	resolveTargetMember: (playerInput: string) => Promise<ResolvedManualMeritMember | null>;
	upsertUser: (params: {
		discordUserId: string;
		discordUsername: string;
		discordNickname: string;
		discordAvatarUrl: string;
	}) => Promise<{ id: string }>;
	findLinkedEvent: (eventSessionId: number) => Promise<{
		id: number;
		name: string;
		createdAt: Date;
	} | null>;
	awardManualMerit: (params: {
		recipientDbUserId: string;
		awardedByDbUserId: string;
		meritTypeCode: MeritTypeCode;
		reason?: string | null;
		eventSessionId?: number | null;
	}) => Promise<{
		id: number;
		meritType: {
			code: MeritTypeCode;
			name: string;
			meritAmount: number;
		};
	}>;
	syncRecipientNickname: (params: { discordUserId: string }) => Promise<'ok' | 'nickname-too-long' | 'failed'>;
	computeAwarderNickname: (params: { discordUserId: string }) => Promise<string | null>;
	getRecipientTotalMerits: (params: { userDbUserId: string }) => Promise<number>;
	notifyRankUp: (params: { discordUserId: string; previousTotalMerits: number; currentTotalMerits: number }) => Promise<void>;
	sendRecipientDm: (params: { discordUserId: string; content: string }) => Promise<boolean>;
};

export type AwardManualMeritWorkflowResult =
	| { kind: 'forbidden' }
	| { kind: 'invalid_player_selection' }
	| { kind: 'invalid_merit_type' }
	| { kind: 'target_not_found' }
	| { kind: 'awarder_not_found' }
	| { kind: 'linked_event_not_found' }
	| { kind: 'linked_event_too_old' }
	| { kind: 'merit_type_not_manual_awardable' }
	| {
			kind: 'awarded';
			meritRecordId: number;
			targetDiscordUserId: string;
			meritTypeCode: MeritTypeCode;
			meritTypeName: string;
			meritAmount: number;
			linkedEventName: string | null;
			reason: string | null;
			dmSent: boolean;
			recipientNicknameTooLong: boolean;
	  };

export type AwardManualMeritWorkflowInput = {
	actor: ActorContext;
	actorMember: ResolvedManualMeritMember | null;
	playerInput: string;
	rawMeritTypeCode: string;
	reason: string | null;
	linkedEventSessionId: number | null;
};

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

async function validateManualMeritRequest({
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

async function resolveLinkedEventForManualMerit({
	findLinkedEvent,
	linkedEventSessionId
}: {
	findLinkedEvent: (eventSessionId: number) => Promise<{
		id: number;
		name: string;
		createdAt: Date;
	} | null>;
	linkedEventSessionId: number | null;
}): Promise<
	| AwardManualMeritWorkflowResult
	| {
			linkedEvent: {
				id: number;
				name: string;
				createdAt: Date;
			} | null;
	  }
> {
	if (typeof linkedEventSessionId !== 'number') {
		return {
			linkedEvent: null
		};
	}

	const linkedEvent = await findLinkedEvent(linkedEventSessionId);
	if (!linkedEvent) {
		return {
			kind: 'linked_event_not_found'
		};
	}

	const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1_000;
	if (linkedEvent.createdAt.getTime() < fiveDaysAgo) {
		return {
			kind: 'linked_event_too_old'
		};
	}

	return {
		linkedEvent
	};
}

async function finalizeManualMeritNotifications({
	deps,
	targetMember,
	awarderMember,
	targetDbUserId,
	meritAmount,
	linkedEventName,
	reason
}: {
	deps: Pick<
		ManualMeritServiceDeps,
		'syncRecipientNickname' | 'computeAwarderNickname' | 'getRecipientTotalMerits' | 'notifyRankUp' | 'sendRecipientDm'
	>;
	targetMember: ResolvedManualMeritMember;
	awarderMember: ResolvedManualMeritMember;
	targetDbUserId: string;
	meritAmount: number;
	linkedEventName: string | null;
	reason: string | null;
}) {
	const syncNicknameResult = await deps.syncRecipientNickname({
		discordUserId: targetMember.discordUserId
	});
	const recipientNicknameTooLong = syncNicknameResult === 'nickname-too-long';

	const awarderNicknameForDm =
		(await deps.computeAwarderNickname({
			discordUserId: awarderMember.discordUserId
		})) ?? awarderMember.discordDisplayName;

	const currentTotalMerits = await deps.getRecipientTotalMerits({
		userDbUserId: targetDbUserId
	});
	const previousTotalMerits = Math.max(0, currentTotalMerits - meritAmount);
	await deps.notifyRankUp({
		discordUserId: targetMember.discordUserId,
		previousTotalMerits,
		currentTotalMerits
	});

	const dmSent = await deps.sendRecipientDm({
		discordUserId: targetMember.discordUserId,
		content: buildManualMeritDmContent({
			meritAmount,
			linkedEventName,
			reason,
			awarderNickname: awarderNicknameForDm
		})
	});

	return {
		dmSent,
		recipientNicknameTooLong
	};
}

function buildManualMeritDmContent({
	meritAmount,
	linkedEventName,
	reason,
	awarderNickname
}: {
	meritAmount: number;
	linkedEventName: string | null;
	reason: string | null;
	awarderNickname: string;
}) {
	const meritChangeLabel = `${formatSignedMeritAmount(meritAmount)} ${Math.abs(meritAmount) === 1 ? 'merit' : 'merits'}`;
	const dmEventLine = linkedEventName ? `\nEvent: ${linkedEventName}` : '';
	const dmReasonLine = reason ? `\nReason: ${reason}` : '';

	return `Your merits were adjusted by **${meritChangeLabel}** by **${awarderNickname}**.${dmEventLine}${dmReasonLine}`;
}

function formatSignedMeritAmount(amount: number) {
	return amount >= 0 ? `+${amount}` : `${amount}`;
}
