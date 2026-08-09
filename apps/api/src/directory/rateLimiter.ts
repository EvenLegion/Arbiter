import type Redis from 'ioredis';

export type DirectoryRateLimitDecision = {
	allowed: boolean;
	limit: number;
	remaining: number;
	retryAfterSeconds: number;
};

export type DirectoryRateLimiter = {
	consume: (credentialId: string) => Promise<DirectoryRateLimitDecision>;
};

const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
	redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { count, ttl }
`;

export function createRedisDirectoryRateLimiter(
	redis: Redis,
	{ limit, windowSeconds }: { limit: number; windowSeconds: number }
): DirectoryRateLimiter {
	return {
		consume: async (credentialId) => {
			const raw = await redis.eval(CONSUME_SCRIPT, 1, `rate:directory:${credentialId}`, String(windowSeconds));
			if (!Array.isArray(raw) || raw.length !== 2) throw new Error('Invalid Redis rate-limit response');
			const count = Number(raw[0]);
			const ttl = Number(raw[1]);
			if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(ttl) || ttl < 0) {
				throw new Error('Invalid Redis rate-limit response');
			}
			return {
				allowed: count <= limit,
				limit,
				remaining: Math.max(0, limit - count),
				retryAfterSeconds: Math.max(1, ttl)
			};
		}
	};
}
