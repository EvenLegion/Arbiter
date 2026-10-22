import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { initializeEventReviewState } from '../../../../../src/lib/services/event-lifecycle';

describe('expected event duration review defaults', () => {
	const cases = [60, 90, 120, 150, 180].flatMap((expectedEventDuration) =>
		[0.5, 1, 2].map((actualMultiplier) => ({ expectedEventDuration, actualMultiplier }))
	);

	it.each(cases)(
		'uses an inclusive half threshold for $expectedEventDuration minutes, actual multiplier $actualMultiplier',
		async ({ expectedEventDuration, actualMultiplier }) => {
			const actualSeconds = expectedEventDuration * 60 * actualMultiplier;
			const thresholdSeconds = Math.min(actualSeconds, expectedEventDuration * 60) / 2;
			const deps = reviewDeps(expectedEventDuration, actualSeconds, [thresholdSeconds, thresholdSeconds - 1, actualSeconds + 60]);

			const result = await initializeEventReviewState(deps, { eventSessionId: 1 });

			expect(result).toMatchObject({ kind: 'review_initialized', durationSeconds: actualSeconds });
			expect(deps.upsertReviewDecisions).toHaveBeenCalledWith({
				eventSessionId: 1,
				decisions: [
					{ targetDbUserId: 'db-0', decision: EventReviewDecisionKind.MERIT },
					{ targetDbUserId: 'db-1', decision: EventReviewDecisionKind.NO_MERIT },
					{ targetDbUserId: 'db-2', decision: EventReviewDecisionKind.MERIT }
				],
				overwriteExisting: false
			});
			// The merit denominator must not cap the stored attendance at expected duration.
			expect(deps.upsertParticipantStats).toHaveBeenCalledWith({
				eventSessionId: 1,
				participants: [
					{ dbUserId: 'db-0', attendedSeconds: thresholdSeconds },
					{ dbUserId: 'db-1', attendedSeconds: thresholdSeconds - 1 },
					{ dbUserId: 'db-2', attendedSeconds: actualSeconds }
				]
			});
		}
	);

	it.each([null, undefined])('retains the prior configured threshold for legacy expected duration %s', async (expectedEventDuration) => {
		const deps = reviewDeps(expectedEventDuration, 3600, [1800, 2160, 2159]);
		await initializeEventReviewState(deps, { eventSessionId: 1 });
		expect(deps.upsertReviewDecisions.mock.calls[0]?.[0].decisions.map((row: { decision: string }) => row.decision)).toEqual([
			EventReviewDecisionKind.NO_MERIT,
			EventReviewDecisionKind.MERIT,
			EventReviewDecisionKind.NO_MERIT
		]);
	});

	it.each([0, -1])('does not default to merit for a nonpositive actual duration (%i)', async (actualSeconds) => {
		const deps = reviewDeps(60, actualSeconds, [100]);
		await initializeEventReviewState(deps, { eventSessionId: 1 });
		expect(deps.upsertReviewDecisions).toHaveBeenCalledWith(
			expect.objectContaining({
				decisions: [{ targetDbUserId: 'db-0', decision: EventReviewDecisionKind.NO_MERIT }]
			})
		);
	});
});

function reviewDeps(expectedEventDuration: number | null | undefined, actualSeconds: number, attendance: number[]) {
	return {
		findEventSession: vi.fn().mockResolvedValue({
			id: 1,
			state: EventSessionState.ENDED_PENDING_REVIEW,
			startedAt: new Date(0),
			endedAt: new Date(actualSeconds * 1000),
			expectedEventDuration
		}),
		getTrackingParticipantsSnapshot: vi
			.fn()
			.mockResolvedValue(attendance.map((attendedSeconds, index) => ({ discordUserId: `discord-${index}`, attendedSeconds }))),
		findUsersByDiscordUserIds: vi
			.fn()
			.mockResolvedValue(attendance.map((_, index) => ({ id: `db-${index}`, discordUserId: `discord-${index}` }))),
		upsertParticipantStats: vi.fn().mockResolvedValue(undefined),
		upsertReviewDecisions: vi.fn().mockResolvedValue(undefined),
		clearTrackingSession: vi.fn().mockResolvedValue(undefined),
		syncReviewMessage: vi.fn().mockResolvedValue(true),
		defaultMinAttendancePercent: 60
	};
}
