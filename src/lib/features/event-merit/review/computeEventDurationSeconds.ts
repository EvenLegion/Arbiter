export function computeEventDurationSeconds({ startedAt, endedAt }: { startedAt: Date | null; endedAt: Date | null }) {
	if (!startedAt || !endedAt) {
		return 0;
	}

	return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
}
