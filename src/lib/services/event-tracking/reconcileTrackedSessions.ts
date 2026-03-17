import type { ActiveTrackedEventSession } from './eventTrackingModel';

export function reconcileTrackedSessions({
	eventSessionIds,
	activeSessions
}: {
	eventSessionIds: number[];
	activeSessions: ActiveTrackedEventSession[];
}) {
	const activeSessionById = new Map(activeSessions.map((session) => [session.id, session]));

	return {
		activeSessionById,
		staleEventSessionIds: eventSessionIds.filter((eventSessionId) => !activeSessionById.has(eventSessionId))
	};
}
