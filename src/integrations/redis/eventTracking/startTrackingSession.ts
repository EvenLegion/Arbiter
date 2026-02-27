import { getRedisClient } from '../client';

const ACTIVE_SESSIONS_KEY = 'arbiter:event-tracking:active-sessions';
const SESSION_KEY_PREFIX = 'arbiter:event-tracking:session:';

type StartTrackingSessionParams = {
	eventSessionId: number;
	guildId: string;
	startedAtMs: number;
};

export async function startTrackingSession({ eventSessionId, guildId, startedAtMs }: StartTrackingSessionParams) {
	const redis = getRedisClient();
	const sessionId = String(eventSessionId);
	const sessionKey = getSessionKey(eventSessionId);
	const startedAt = String(startedAtMs);

	const tx = redis.multi();
	tx.hset(sessionKey, {
		guildId,
		startedAtMs: startedAt,
		lastTickAtMs: startedAt,
		status: 'ACTIVE'
	});
	tx.sadd(ACTIVE_SESSIONS_KEY, sessionId);
	await tx.exec();
}

function getSessionKey(eventSessionId: number) {
	return `${SESSION_KEY_PREFIX}${eventSessionId}`;
}
