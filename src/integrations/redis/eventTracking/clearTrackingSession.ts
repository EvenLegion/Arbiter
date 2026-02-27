import { getRedisClient } from '../client';

const ACTIVE_SESSIONS_KEY = 'arbiter:event-tracking:active-sessions';
const SESSION_KEY_PREFIX = 'arbiter:event-tracking:session:';
const PARTICIPANTS_KEY_PREFIX = 'arbiter:event-tracking:participants:';
const REVIEW_LOCK_KEY_PREFIX = 'arbiter:event-review:lock:';

type ClearTrackingSessionParams = {
	eventSessionId: number;
};

export async function clearTrackingSession({ eventSessionId }: ClearTrackingSessionParams) {
	const redis = getRedisClient();
	const sessionId = String(eventSessionId);

	const tx = redis.multi();
	tx.srem(ACTIVE_SESSIONS_KEY, sessionId);
	tx.del(getSessionKey(eventSessionId), getParticipantsKey(eventSessionId), getReviewLockKey(eventSessionId));
	await tx.exec();
}

function getSessionKey(eventSessionId: number) {
	return `${SESSION_KEY_PREFIX}${eventSessionId}`;
}

function getParticipantsKey(eventSessionId: number) {
	return `${PARTICIPANTS_KEY_PREFIX}${eventSessionId}`;
}

function getReviewLockKey(eventSessionId: number) {
	return `${REVIEW_LOCK_KEY_PREFIX}${eventSessionId}`;
}
