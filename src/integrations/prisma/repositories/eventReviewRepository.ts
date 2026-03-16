import {
	finalizeEventReview,
	getEventReviewPage,
	upsertEventReviewDecision,
	upsertManyEventParticipantStats,
	upsertManyEventReviewDecisions
} from '../event/eventReviewQueries';

export type { EventReviewPage, EventReviewPageAttendee } from '../event/eventReviewQueries';

export const eventReviewRepository = {
	getReviewPage: getEventReviewPage,
	upsertDecision: upsertEventReviewDecision,
	upsertParticipantStats: upsertManyEventParticipantStats,
	upsertReviewDecisions: upsertManyEventReviewDecisions,
	finalizeReview: finalizeEventReview
};
