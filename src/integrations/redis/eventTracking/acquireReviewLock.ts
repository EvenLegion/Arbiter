import { getRedisClient } from '../client';
import { parseRedisInteger, parseRedisOptionalString } from './parsers';

const REVIEW_LOCK_KEY_PREFIX = 'arbiter:event-review:lock:';

/**
 * Atomically acquires or renews a per-session review lock.
 *
 * Behavior:
 * - Reads current lock owner for `arbiter:event-review:lock:{eventSessionId}`.
 * - If unlocked, sets owner to reviewerDiscordUserId with TTL and returns {1, owner}.
 * - If already owned by the same reviewer, refreshes TTL and returns {1, owner}.
 * - If owned by someone else, returns {0, currentOwner}.
 *
 * Return shape:
 * - Array: [acquiredFlag, ownerDiscordUserId]
 */
const ACQUIRE_REVIEW_LOCK_SCRIPT = `
local lockKey = KEYS[1]
local reviewerDiscordUserId = ARGV[1]
local lockTtlMs = tonumber(ARGV[2])

local owner = redis.call('GET', lockKey)
if not owner then
	redis.call('SET', lockKey, reviewerDiscordUserId, 'PX', lockTtlMs)
	return {1, reviewerDiscordUserId}
end

if owner == reviewerDiscordUserId then
	redis.call('PEXPIRE', lockKey, lockTtlMs)
	return {1, owner}
end

return {0, owner}
`;

type AcquireReviewLockParams = {
	eventSessionId: number;
	reviewerDiscordUserId: string;
	lockTtlMs: number;
};

export type AcquireReviewLockResult = {
	acquired: boolean;
	ownerDiscordUserId: string | null;
};

export async function acquireReviewLock({
	eventSessionId,
	reviewerDiscordUserId,
	lockTtlMs
}: AcquireReviewLockParams): Promise<AcquireReviewLockResult> {
	const redis = getRedisClient();
	const rawResult = await redis.eval(ACQUIRE_REVIEW_LOCK_SCRIPT, 1, getReviewLockKey(eventSessionId), reviewerDiscordUserId, String(lockTtlMs));

	return parseAcquireReviewLockResult(rawResult);
}

function getReviewLockKey(eventSessionId: number) {
	return `${REVIEW_LOCK_KEY_PREFIX}${eventSessionId}`;
}

function parseAcquireReviewLockResult(value: unknown): AcquireReviewLockResult {
	if (!Array.isArray(value) || value.length < 2) {
		throw new Error('Invalid acquireReviewLock Redis response');
	}

	const acquired = parseRedisInteger(value[0], 'acquireReviewLock acquired flag') === 1;
	const ownerDiscordUserId = parseRedisOptionalString(value[1], 'acquireReviewLock ownerDiscordUserId');
	return {
		acquired,
		ownerDiscordUserId
	};
}
