import { EventReviewDecisionKind } from '@prisma/client';

export type ParsedEventReviewPageAction = {
	action: 'page';
	eventSessionId: number;
	page: number;
};

export type ParsedEventReviewSubmitAction = {
	action: 'submit';
	eventSessionId: number;
	mode: 'with' | 'without';
};

export type ParsedEventReviewDecisionAction = {
	action: 'decision';
	eventSessionId: number;
	targetDbUserId: string;
	decision: EventReviewDecisionKind;
	page: number;
};

export type ParsedEventReviewButton = ParsedEventReviewPageAction | ParsedEventReviewSubmitAction | ParsedEventReviewDecisionAction;
