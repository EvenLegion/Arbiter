import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { getMeritRankSymbol } from '../../../../../../src/lib/services/merit-rank/meritRank';
import {
	buildEventReviewPresentationModel,
	computeEventReviewAttendancePercent,
	resolveEventReviewDecision
} from '../../../../../../src/lib/features/event-merit/review/presentation/eventReviewPresentationModel';

describe('eventReviewPresentationModel', () => {
	it('uses the capped duration for percentages and preserves manual decisions in either direction', () => {
		const model = buildEventReviewPresentationModel({
			state: EventSessionState.ENDED_PENDING_REVIEW,
			durationSeconds: 7200,
			expectedEventDuration: 60,
			page: 1,
			pageSize: 10,
			defaultMinAttendancePct: 100,
			fullAttendanceGraceSeconds: 60,
			attendees: [
				{ dbUserId: 'a', discordUserId: 'a', discordUsername: 'a', discordNickname: 'a', attendedSeconds: 1800, decision: null },
				{ dbUserId: 'b', discordUserId: 'b', discordUsername: 'b', discordNickname: 'b', attendedSeconds: 1799, decision: null },
				{
					dbUserId: 'c',
					discordUserId: 'c',
					discordUsername: 'c',
					discordNickname: 'c',
					attendedSeconds: 0,
					decision: EventReviewDecisionKind.MERIT
				},
				{
					dbUserId: 'd',
					discordUserId: 'd',
					discordUsername: 'd',
					discordNickname: 'd',
					attendedSeconds: 7200,
					decision: EventReviewDecisionKind.NO_MERIT
				}
			]
		});
		expect(model.attendees.map((attendee) => attendee.selectedDecision)).toEqual(['MERIT', 'NO_MERIT', 'MERIT', 'NO_MERIT']);
		expect(model.attendees[0]?.attendancePercent).toBe(50);
		expect(model.attendees[1]?.attendancePercent).toBeLessThan(50);
		expect(model.attendees[3]?.attendancePercent).toBe(100);
	});

	it('does not use the legacy full-attendance grace window to cross the new half threshold', () => {
		expect(
			resolveEventReviewDecision({
				decision: null,
				attendedSeconds: 29,
				durationSeconds: 60,
				expectedEventDuration: 60,
				defaultMinAttendancePct: 50,
				fullAttendanceGraceSeconds: 60
			})
		).toBe(EventReviewDecisionKind.NO_MERIT);
	});

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

	it('uses the same grace window when deriving the default decision', () => {
		expect(
			resolveEventReviewDecision({
				decision: null,
				attendedSeconds: 3600,
				durationSeconds: 3620,
				defaultMinAttendancePct: 100,
				fullAttendanceGraceSeconds: 60
			})
		).toBe(EventReviewDecisionKind.MERIT);
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
