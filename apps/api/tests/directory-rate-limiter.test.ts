import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { createRedisDirectoryRateLimiter } from '../src/directory/rateLimiter';

describe('directory Redis rate limiter', () => {
	it('atomically consumes a bounded per-credential window', async () => {
		const evalCommand = vi.fn().mockResolvedValueOnce([1, 60]).mockResolvedValueOnce([61, 12]);
		const limiter = createRedisDirectoryRateLimiter({ eval: evalCommand } as unknown as Redis, { limit: 60, windowSeconds: 60 });

		await expect(limiter.consume('credential-id')).resolves.toEqual({
			allowed: true,
			limit: 60,
			remaining: 59,
			retryAfterSeconds: 60
		});
		await expect(limiter.consume('credential-id')).resolves.toEqual({
			allowed: false,
			limit: 60,
			remaining: 0,
			retryAfterSeconds: 12
		});
		expect(evalCommand).toHaveBeenCalledWith(expect.stringContaining("redis.call('INCR'"), 1, 'rate:directory:credential-id', '60');
	});

	it('rejects unexpected Redis results instead of failing open', async () => {
		const limiter = createRedisDirectoryRateLimiter({ eval: vi.fn().mockResolvedValue([1, -1]) } as unknown as Redis, {
			limit: 60,
			windowSeconds: 60
		});
		await expect(limiter.consume('credential-id')).rejects.toThrow('Invalid Redis rate-limit response');
	});
});
