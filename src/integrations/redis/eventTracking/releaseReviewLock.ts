import { getRedisClient } from '../client';
import { parseRedisInteger } from './parsers';

const REVIEW_LOCK_KEY_PREFIX = 'arbiter:event-review:lock:';

/**
 * Atomically releases a per-session review lock only if caller owns it.
 *
 * Behavior:
 * - Compares lock owner with reviewerDiscordUserId.
 * - Deletes the lock key only when owner matches.
 * - Returns 1 if released, 0 if not released.
 */
const RELEASE_REVIEW_LOCK_SCRIPT = `
local lockKey = KEYS[1]
local reviewerDiscordUserId = ARGV[1]

if redis.call('GET', lockKey) == reviewerDiscordUserId then
	return redis.call('DEL', lockKey)
end

return 0
`;

type ReleaseReviewLockParams = {
	eventSessionId: number;
	reviewerDiscordUserId: string;
};

export async function releaseReviewLock({ eventSessionId, reviewerDiscordUserId }: ReleaseReviewLockParams) {
	const redis = getRedisClient();
	const rawResult = await redis.eval(RELEASE_REVIEW_LOCK_SCRIPT, 1, getReviewLockKey(eventSessionId), reviewerDiscordUserId);
	return parseRedisInteger(rawResult, `releaseReviewLock result for eventSessionId=${eventSessionId}`) === 1;
}

function getReviewLockKey(eventSessionId: number) {
	return `${REVIEW_LOCK_KEY_PREFIX}${eventSessionId}`;
}
