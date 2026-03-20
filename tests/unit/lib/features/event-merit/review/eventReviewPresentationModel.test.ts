import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { getMeritRankSymbol } from '../../../../../../src/lib/services/merit-rank/meritRank';
import {
	buildEventReviewPresentationModel,
	computeEventReviewAttendancePercent
} from '../../../../../../src/lib/features/event-merit/review/presentation/eventReviewPresentationModel';

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
		expect(model.attendeesFieldValue).toContain('(100%)');
	});

	it('treats attendance within the configured grace window as full attendance for display', () => {
		expect(
			computeEventReviewAttendancePercent({
				attendedSeconds: 3600,
				durationSeconds: 3620,
				fullAttendanceGraceSeconds: 60
			})
		).toBe(100);
	});

	it('uses the base nickname for attendee toggle labels by stripping prefixes and merit suffixes', () => {
		const meritRankSymbol = getMeritRankSymbol(1);
		expect(meritRankSymbol).toBeTruthy();

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
					discordNickname: `NVY | Alpha ${meritRankSymbol}`,
					attendedSeconds: 100,
					decision: EventReviewDecisionKind.MERIT
				}
			]
		});

		expect(model.attendees[0]?.labelSuffix).toBe('Alpha');
	});

	it('rounds displayed attendance percentages to whole numbers', () => {
		const model = buildEventReviewPresentationModel({
			state: EventSessionState.ENDED_PENDING_REVIEW,
			durationSeconds: 3,
			page: 1,
			pageSize: 10,
			attendees: [
				{
					dbUserId: 'db-user-1',
					discordUserId: '123',
					discordUsername: 'alpha',
					discordNickname: 'Alpha',
					attendedSeconds: 2,
					decision: EventReviewDecisionKind.MERIT
				}
			]
		});

		expect(model.attendeesFieldValue).toContain('(67%)');
	});
});
