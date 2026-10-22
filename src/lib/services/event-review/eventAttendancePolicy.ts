/** Resolve the merit denominator without changing the event's actual timestamps or attendance. */
export function resolveEventAttendancePolicy({
	durationSeconds,
	expectedEventDuration,
	defaultMinAttendancePct,
	fullAttendanceGraceSeconds = 0
}: {
	durationSeconds: number;
	/** Selected duration in whole minutes; absent on legacy events. */
	expectedEventDuration?: number | null;
	defaultMinAttendancePct: number;
	fullAttendanceGraceSeconds?: number;
}) {
	if (expectedEventDuration == null) {
		return { durationSeconds, defaultMinAttendancePct, fullAttendanceGraceSeconds };
	}

	return {
		durationSeconds: Math.min(durationSeconds, expectedEventDuration * 60),
		defaultMinAttendancePct: 50,
		fullAttendanceGraceSeconds: 0
	};
}
