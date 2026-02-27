import { getRedisClient } from '../client';
import { parseRedisInteger } from './parsers';

const ACTIVE_SESSIONS_KEY = 'arbiter:event-tracking:active-sessions';
const SESSION_KEY_PREFIX = 'arbiter:event-tracking:session:';

type StopTrackingSessionParams = {
	eventSessionId: number;
	stoppedAtMs?: number;
};

export async function stopTrackingSession({ eventSessionId, stoppedAtMs = Date.now() }: StopTrackingSessionParams) {
	const redis = getRedisClient();
	const sessionId = String(eventSessionId);
	const sessionKey = getSessionKey(eventSessionId);

	// Remove from active set first so new ticks are rejected before flush/finalization runs.
	const tx = redis.multi();
	tx.srem(ACTIVE_SESSIONS_KEY, sessionId);
	tx.hset(sessionKey, {
		lastTickAtMs: String(stoppedAtMs),
		status: 'STOPPED'
	});
	const results = await tx.exec();
	const sremResult = results?.[0]?.[1];

	return parseRedisInteger(sremResult, `stopTrackingSession srem result for eventSessionId=${eventSessionId}`) === 1;
}

function getSessionKey(eventSessionId: number) {
	return `${SESSION_KEY_PREFIX}${eventSessionId}`;
}
