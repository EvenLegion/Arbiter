import { EventReviewDecisionKind } from '@prisma/client';

import type { ActorContext } from '../_shared/actor';

export type { RecordEventReviewDecisionResult, LoadEventReviewPageResult, RefreshEventReviewPageResult } from './eventReviewService';

export type RecordEventReviewDecisionInput = {
	actor: ActorContext;
	eventSessionId: number;
	targetDbUserId: string;
	decision: EventReviewDecisionKind;
	page: number;
};

export type LoadEventReviewPageInput = {
	eventSessionId: number;
	page: number;
};

export type RefreshEventReviewPageInput = LoadEventReviewPageInput;

export type EventReviewServiceContract = {
	recordDecision: (input: RecordEventReviewDecisionInput) => Promise<import('./eventReviewService').RecordEventReviewDecisionResult>;
	getReviewPage: (input: LoadEventReviewPageInput) => Promise<import('./eventReviewService').LoadEventReviewPageResult>;
	refreshReviewPage: (input: RefreshEventReviewPageInput) => Promise<import('./eventReviewService').RefreshEventReviewPageResult>;
};
