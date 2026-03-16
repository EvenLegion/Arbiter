import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildEventReviewPresentationModel } from '../../../../../../src/lib/features/event-merit/review/eventReviewPresentationModel';

describe('eventReviewPresentationModel', () => {
	it('marks review as open only for ended-pending-review sessions', () => {
		expect(
			buildEventReviewPresentationModel({
				state: EventSessionState.ENDED_PENDING_REVIEW,
				durationSeconds: 600,
				page: 1,
				pageSize: 10,
				attendees: []
			}).reviewIsOpen
		).toBe(true);

		expect(
			buildEventReviewPresentationModel({
				state: EventSessionState.ACTIVE,
				durationSeconds: 600,
				page: 1,
				pageSize: 10,
				attendees: []
			}).reviewIsOpen
		).toBe(false);
	});

	it('computes default attendee decisions and attendance percentages outside the presenter', () => {
		const model = buildEventReviewPresentationModel({
			state: EventSessionState.ENDED_PENDING_REVIEW,
			durationSeconds: 100,
			page: 1,
			pageSize: 10,
			attendees: [
				{
					dbUserId: 'db-user-1',
					discordUserId: '123',
					discordUsername: 'alpha',
					discordNickname: 'Alpha',
					attendedSeconds: 100,
					decision: null
				},
				{
					dbUserId: 'db-user-2',
					discordUserId: '456',
					discordUsername: 'bravo',
					discordNickname: 'Bravo',
					attendedSeconds: 0,
					decision: EventReviewDecisionKind.NO_MERIT
				}
			]
		});

		expect(model.attendees[0]).toMatchObject({
			attendancePercent: 100,
			selectedDecision: EventReviewDecisionKind.MERIT
		});
		expect(model.attendees[1]).toMatchObject({
			attendancePercent: 0,
			selectedDecision: EventReviewDecisionKind.NO_MERIT
		});
		expect(model.attendeesFieldValue).toContain('<@123>');
	});
});
