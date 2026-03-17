import { EventReviewDecisionKind } from '@prisma/client';

export function clampAttendedSecondsForReview(attendedSeconds: number, durationSeconds: number) {
	const safeAttendedSeconds = Math.max(0, attendedSeconds);
	if (durationSeconds <= 0) {
		return safeAttendedSeconds;
	}

	return Math.min(durationSeconds, safeAttendedSeconds);
}

export function resolveDefaultReviewDecision({
	attendedSeconds,
	durationSeconds,
	defaultMinAttendancePercent
}: {
	attendedSeconds: number;
	durationSeconds: number;
	defaultMinAttendancePercent: number;
}) {
	if (durationSeconds <= 0) {
		return EventReviewDecisionKind.NO_MERIT;
	}

	return attendedSeconds / durationSeconds >= defaultMinAttendancePercent / 100 ? EventReviewDecisionKind.MERIT : EventReviewDecisionKind.NO_MERIT;
}
