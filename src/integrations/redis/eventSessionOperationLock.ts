import { getRedisClient } from './client';

const EVENT_SESSION_OPERATION_LOCK_PREFIX = 'arbiter:event-session:operation-lock:';

const RELEASE_EVENT_SESSION_OPERATION_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
	return redis.call('DEL', KEYS[1])
end

return 0
`;

export const EVENT_SESSION_OPERATION_LOCK_TTL_MS = 60_000;

export async function acquireEventSessionOperationLock({
	eventSessionId,
	token,
	ttlMs = EVENT_SESSION_OPERATION_LOCK_TTL_MS
}: {
	eventSessionId: number;
	token: string;
	ttlMs?: number;
}) {
	const redis = getRedisClient();
	const result = await redis.set(getEventSessionOperationLockKey(eventSessionId), token, 'PX', ttlMs, 'NX');
	return result === 'OK';
}

export async function releaseEventSessionOperationLock({ eventSessionId, token }: { eventSessionId: number; token: string }) {
	const redis = getRedisClient();
	const result = await redis.eval(RELEASE_EVENT_SESSION_OPERATION_LOCK_SCRIPT, 1, getEventSessionOperationLockKey(eventSessionId), token);
	return Number(result) === 1;
}

export function getEventSessionOperationLockKey(eventSessionId: number) {
	return `${EVENT_SESSION_OPERATION_LOCK_PREFIX}${eventSessionId}`;
}
