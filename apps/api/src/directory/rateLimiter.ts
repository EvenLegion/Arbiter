import { Command, type Redis } from 'ioredis';

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
			const raw = await runBoundedCommand(() => executeConsume(redis, credentialId, windowSeconds, deadlineAtMs), signal, deadlineAtMs);
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
	command: () => Promise<unknown>,
	signal: AbortSignal | undefined,
	deadlineAtMs: number | undefined
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const cleanup = () => {
			signal?.removeEventListener('abort', onAbort);
		};
		const settle = (operation: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			operation();
		};
		const terminate = (error: unknown) => settle(() => reject(error));
		const onAbort = () => terminate(signal?.reason ?? new Error('Redis rate-limit command aborted'));

		if (signal?.aborted) {
			onAbort();
			return;
		}
		signal?.addEventListener('abort', onAbort, { once: true });
		if (deadlineAtMs !== undefined && deadlineAtMs <= Date.now()) {
			terminate(new Error('Redis rate-limit command deadline exceeded'));
			return;
		}
		command().then(
			(value) => settle(() => resolve(value)),
			(error: unknown) => settle(() => reject(error))
		);
	});
}

function executeConsume(redis: Redis, credentialId: string, windowSeconds: number, deadlineAtMs: number | undefined): Promise<unknown> {
	const key = `rate:directory:${credentialId}`;
	if (deadlineAtMs === undefined) return redis.eval(CONSUME_SCRIPT, 1, key, String(windowSeconds));
	const remainingMs = Math.floor(deadlineAtMs - Date.now());
	if (remainingMs <= 0) return Promise.reject(new Error('Redis rate-limit command deadline exceeded'));
	const command = new Command('eval', [CONSUME_SCRIPT, 1, key, String(windowSeconds)], { keyPrefix: redis.options.keyPrefix });
	command.setTimeout(remainingMs);
	return redis.sendCommand(command) as Promise<unknown>;
}
