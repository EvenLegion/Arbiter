import { EventSessionState, type Prisma } from '@prisma/client';

export type EventTierLookup = {
	id: number;
	name: string;
	code: string;
	meritType: {
		meritAmount: number;
	};
};

export type EventLifecycleEventSession = Prisma.EventGetPayload<{
	include: {
		hostUser: true;
		eventTier: {
			include: {
				meritType: true;
			};
		};
		channels: true;
		eventMessages: true;
	};
}>;

export type EventReviewParticipantSnapshot = {
	discordUserId: string;
	attendedSeconds: number;
};

export type EventReviewUserLookup = {
	id: string;
	discordUserId: string;
};

export type EventReviewFinalizationResult = {
	finalized: boolean;
	toState: Extract<EventSessionState, 'FINALIZED_WITH_MERITS' | 'FINALIZED_NO_MERITS'>;
	awardedCount: number;
	awardedMeritAmount: number;
	awardedUsers: Array<{
		dbUserId: string;
		discordUserId: string;
	}>;
};
