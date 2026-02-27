import { getRedisClient } from '../client';

const ACTIVE_SESSIONS_KEY = 'arbiter:event-tracking:active-sessions';

export async function listActiveTrackingSessionIds() {
	const redis = getRedisClient();
	const rawSessionIds = await redis.smembers(ACTIVE_SESSIONS_KEY);
	const parsedSessionIds = new Set<number>();

	for (const rawSessionId of rawSessionIds) {
		const parsed = Number.parseInt(rawSessionId, 10);
		if (!Number.isNaN(parsed) && Number.isInteger(parsed) && parsed > 0) {
			parsedSessionIds.add(parsed);
		}
	}

	return [...parsedSessionIds].sort((left, right) => left - right);
}
