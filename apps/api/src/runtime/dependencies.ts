import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Pool } from 'pg';
import type { Logger } from 'pino';

import type { ApiConfig } from '../config';

export type ApiDependencies = {
	checkReadiness: (timeoutMs: number) => Promise<boolean>;
	close: () => Promise<void>;
};

export function createApiDependencies(config: ApiConfig, logger: Logger): ApiDependencies {
	const pool = new Pool({
		connectionString: config.databaseUrl,
		max: config.databasePoolMax,
		idleTimeoutMillis: 10_000,
		connectionTimeoutMillis: config.readinessTimeoutMs,
		application_name: 'arbiter-api'
	});
	const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
	const redis = new Redis({
		host: config.redis.host,
		port: config.redis.port,
		password: config.redis.password,
		db: config.redis.db,
		connectionName: 'arbiter-api',
		keyPrefix: `${config.redis.namespace}:`,
		lazyConnect: true,
		maxRetriesPerRequest: 1,
		connectTimeout: config.readinessTimeoutMs,
		retryStrategy: (attempt) => Math.min(attempt * 100, 2_000)
	});

	redis.on('error', (error) => {
		logger.warn({ dependency: 'redis', errorName: error.name }, 'API Redis dependency error');
	});

	return {
		checkReadiness: async (timeoutMs) => {
			const [databaseReady, redisReady] = await Promise.all([
				settlesWithin(prisma.$queryRaw`SELECT 1`, timeoutMs),
				settlesWithin(redis.ping(), timeoutMs)
			]);
			return databaseReady && redisReady;
		},
		close: async () => {
			redis.removeAllListeners('error');
			if (redis.status !== 'end') {
				try {
					await redis.quit();
				} catch {
					redis.disconnect();
				}
			}
			await prisma.$disconnect();
			await pool.end();
		}
	};
}

async function settlesWithin(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
	let timeout: NodeJS.Timeout | undefined;
	try {
		await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => reject(new Error('dependency timeout')), timeoutMs);
			})
		]);
		return true;
	} catch {
		return false;
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
