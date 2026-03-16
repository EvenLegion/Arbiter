import type { ActorContext } from '../_shared/actor';

export type {
	EventLifecycleEventSession,
	CreateEventDraftResult,
	AddTrackedChannelResult,
	TransitionEventSessionResult,
	InitializeEventReviewResult,
	FinalizeEventReviewLifecycleResult
} from './eventLifecycleService';

export type CreateEventDraftInput = {
	hostDbUserId: string;
	hostDiscordUserId: string;
	issuerTag: string;
	eventTierId: number;
	eventName: string;
	primaryVoiceChannelId: string;
};

export type AddTrackedChannelInput = {
	actor: ActorContext;
	eventSessionId: number;
	targetVoiceChannelId: string;
	renameTo: string | null;
	actorTag: string;
};

export type ActivateDraftEventInput = {
	actor: ActorContext;
	eventSessionId: number;
};

export type CancelDraftEventInput = ActivateDraftEventInput;

export type EndActiveEventInput = {
	actor: ActorContext;
	actorTag: string;
	eventSessionId: number;
};

export type InitializeEventReviewStateInput = {
	eventSessionId: number;
};

export type FinalizeEventReviewLifecycleInput = {
	actor: ActorContext;
	eventSessionId: number;
	mode: 'with' | 'without';
};

export type EventLifecycleServiceContract = {
	createDraft: (input: CreateEventDraftInput) => Promise<import('./eventLifecycleService').CreateEventDraftResult>;
	addTrackedChannel: (input: AddTrackedChannelInput) => Promise<import('./eventLifecycleService').AddTrackedChannelResult>;
	activateDraft: (input: ActivateDraftEventInput) => Promise<import('./eventLifecycleService').TransitionEventSessionResult>;
	cancelDraft: (input: CancelDraftEventInput) => Promise<import('./eventLifecycleService').TransitionEventSessionResult>;
	endActive: (input: EndActiveEventInput) => Promise<import('./eventLifecycleService').TransitionEventSessionResult>;
	initializeReview: (input: InitializeEventReviewStateInput) => Promise<import('./eventLifecycleService').InitializeEventReviewResult>;
	finalizeReview: (input: FinalizeEventReviewLifecycleInput) => Promise<import('./eventLifecycleService').FinalizeEventReviewLifecycleResult>;
};
