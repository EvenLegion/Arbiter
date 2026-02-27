import { container } from '@sapphire/framework';
import Redis from 'ioredis';
import { ENV_CONFIG } from '../../config/env';

let redisClient: Redis | null = null;

export function getRedisClient() {
	if (redisClient) {
		return redisClient;
	}

	redisClient = new Redis({
		host: ENV_CONFIG.REDIS_HOST,
		port: ENV_CONFIG.REDIS_PORT,
		password: ENV_CONFIG.REDIS_PASSWORD,
		db: ENV_CONFIG.REDIS_DB
	});

	redisClient.on('error', (error) => {
		container.logger.error(
			{
				err: error
			},
			'Redis client error'
		);
	});

	return redisClient;
}
