import type Redis from 'ioredis';

export type DirectoryRateLimitDecision = {
	allowed: boolean;
	limit: number;
	remaining: number;
	retryAfterSeconds: number;
};

export type DirectoryRateLimiter = {
	consume: (credentialId: string, signal?: AbortSignal, deadlineAtMs?: number) => Promise<DirectoryRateLimitDecision>;
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
		consume: async (credentialId, signal, deadlineAtMs) => {
			const raw = await runBoundedCommand(
				redis,
				() => redis.eval(CONSUME_SCRIPT, 1, `rate:directory:${credentialId}`, String(windowSeconds)),
				signal,
				deadlineAtMs
			);
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

async function runBoundedCommand(
	redis: Redis,
	command: () => Promise<unknown>,
	signal: AbortSignal | undefined,
	deadlineAtMs: number | undefined
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let timeout: NodeJS.Timeout | undefined;
		const cleanup = () => {
			if (timeout) clearTimeout(timeout);
			signal?.removeEventListener('abort', onAbort);
		};
		const settle = (operation: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			operation();
		};
		const terminate = (error: unknown) => {
			settle(() => {
				// This limiter owns a dedicated Redis connection configured to flush
				// pending commands before reconnecting, so expired quota writes cannot
				// remain queued and execute after the request has already failed.
				redis.disconnect(true);
				reject(error);
			});
		};
		const onAbort = () => terminate(signal?.reason ?? new Error('Redis rate-limit command aborted'));

		if (signal?.aborted) {
			onAbort();
			return;
		}
		signal?.addEventListener('abort', onAbort, { once: true });
		if (deadlineAtMs !== undefined) {
			const remainingMs = deadlineAtMs - Date.now();
			if (remainingMs <= 0) {
				terminate(new Error('Redis rate-limit command deadline exceeded'));
				return;
			}
			timeout = setTimeout(() => terminate(new Error('Redis rate-limit command deadline exceeded')), remainingMs);
		}
		command().then(
			(value) => settle(() => resolve(value)),
			(error: unknown) => settle(() => reject(error))
		);
	});
}
