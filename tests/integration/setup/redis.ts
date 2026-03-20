import Redis from 'ioredis';

export async function flushRedisDatabase(redisUrl: string) {
	const redis = new Redis(redisUrl);

	try {
		await redis.flushdb();
	} finally {
		await redis.quit().catch(() => {
			redis.disconnect();
		});
	}
}
