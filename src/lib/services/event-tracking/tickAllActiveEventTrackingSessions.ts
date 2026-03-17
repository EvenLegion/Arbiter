import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { reconcileTrackedSessions } from './reconcileTrackedSessions';
import { tickTrackedEventSession } from './tickTrackedEventSession';
import type { EventTrackingServiceDeps, TickAllActiveEventTrackingSessionsResult } from './eventTrackingTypes';

type TickAllActiveEventTrackingSessionsInput = {
	context: ExecutionContext;
};

export async function tickAllActiveEventTrackingSessions(
	deps: EventTrackingServiceDeps,
	{ context }: TickAllActiveEventTrackingSessionsInput
): Promise<TickAllActiveEventTrackingSessionsResult> {
	const logger = context.logger.child({ caller: 'tickAllActiveEventTrackingSessions' });
	const activeSessionIds = await deps.listActiveTrackingSessionIds();

	deps.warningStore.reconcileActiveSessionIds({
		activeEventSessionIds: activeSessionIds
	});
	if (activeSessionIds.length === 0) {
		logger.trace('No active event sessions in Redis');
		return {
			activeSessionIds,
			staleEventSessionIds: [],
			tickedSessionCount: 0
		};
	}

	const activeSessions = await deps.listActiveSessions({
		eventSessionIds: activeSessionIds
	});
	const { activeSessionById, staleEventSessionIds } = reconcileTrackedSessions({
		eventSessionIds: activeSessionIds,
		activeSessions
	});
	const guild = await deps.resolveGuild();

	for (const eventSessionId of staleEventSessionIds) {
		await deps.stopTrackingSession({
			eventSessionId
		});
		deps.warningStore.clearSession({
			eventSessionId
		});
		logger.warn(
			{
				eventSessionId
			},
			'Stopped stale Redis tracking session (not active in database)'
		);
	}

	let tickedSessionCount = 0;
	for (const eventSessionId of activeSessionIds) {
		const session = activeSessionById.get(eventSessionId);
		if (!session) {
			continue;
		}

		const tickContext = createChildExecutionContext({
			context,
			bindings: {
				eventSessionId
			}
		});
		await tickTrackedEventSession(deps, {
			guild,
			session,
			context: tickContext
		});
		tickedSessionCount += 1;
	}

	return {
		activeSessionIds,
		staleEventSessionIds,
		tickedSessionCount
	};
}
