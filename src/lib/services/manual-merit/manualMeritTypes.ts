import { MeritTypeCode } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';

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
