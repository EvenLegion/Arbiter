import { finalizeEventReviewTransaction as finalizeEventReview } from '../event/review/finalizeEventReviewTransaction';
import { getEventReviewPage } from '../event/review/getEventReviewPage';
import { upsertEventReviewDecision } from '../event/review/upsertEventReviewDecision';
import { upsertManyEventParticipantStats } from '../event/review/upsertManyEventParticipantStats';
import { upsertManyEventReviewDecisions } from '../event/review/upsertManyEventReviewDecisions';

export type { EventReviewPage, EventReviewPageAttendee } from '../event/review/getEventReviewPage';

export const eventReviewRepository = {
	getReviewPage: getEventReviewPage,
	upsertDecision: upsertEventReviewDecision,
	upsertParticipantStats: upsertManyEventParticipantStats,
	upsertReviewDecisions: upsertManyEventReviewDecisions,
	finalizeReview: finalizeEventReview
};
