import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Pool } from 'pg';
import type { Logger } from 'pino';

import { createDiscordOAuthClient } from '../auth/discordOAuthClient';
import { createPrismaAuthRepository } from '../auth/prismaRepository';
import { createRedisAuthStore } from '../auth/redisStore';
import { createAuthService } from '../auth/service';
import type { AuthService } from '../auth/types';
import type { ApiConfig } from '../config';
import { createPrismaApiCredentialRepository } from '../credentials/prismaRepository';
import { createApiCredentialService } from '../credentials/service';
import type { ApiCredentialService } from '../credentials/types';
import { createPrismaDirectoryRepository } from '../directory/prismaRepository';
import { createDirectoryService } from '../directory/service';
import type { DirectoryService } from '../directory/types';
import { createRedisDirectoryRateLimiter, type DirectoryRateLimiter } from '../directory/rateLimiter';

export type ApiDependencies = {
	authService: AuthService;
	credentialService: ApiCredentialService;
	directoryService: DirectoryService;
	directoryRateLimiter: DirectoryRateLimiter;
	checkReadiness: (timeoutMs: number) => Promise<boolean>;
	close: () => Promise<void>;
};

export function createApiDependencies(config: ApiConfig, logger: Logger): ApiDependencies {
	const pool = new Pool({
		connectionString: config.databaseUrl,
		max: config.databasePoolMax,
		idleTimeoutMillis: 10_000,
		connectionTimeoutMillis: config.databaseConnectTimeoutMs,
		statement_timeout: config.requestTimeoutMs,
		application_name: 'arbiter-api'
	});
	pool.on('error', (error) => {
		logger.warn({ dependency: 'postgres', errorName: error.name }, 'API Postgres dependency error');
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
		connectTimeout: config.redisConnectTimeoutMs,
		retryStrategy: (attempt) => Math.min(attempt * 100, 2_000)
	});

	redis.on('error', (error) => {
		logger.warn({ dependency: 'redis', errorName: error.name }, 'API Redis dependency error');
	});
	const credentialService = createApiCredentialService({
		repository: createPrismaApiCredentialRepository(prisma),
		pepper: config.credentialPepper
	});
	const authService = createAuthService({
		store: createRedisAuthStore(redis),
		repository: createPrismaAuthRepository(prisma),
		oauthClient: createDiscordOAuthClient({
			clientId: config.auth.discordClientId,
			clientSecret: config.auth.discordClientSecret,
			callbackUrl: config.auth.discordCallbackUrl,
			timeoutMs: Math.min(5_000, config.requestTimeoutMs)
		}),
		clientId: config.auth.discordClientId,
		callbackUrl: config.auth.discordCallbackUrl,
		allowedRedirectUrls: config.auth.allowedRedirectUrls,
		stateTtlSeconds: config.auth.stateTtlSeconds,
		sessionIdleTtlSeconds: config.auth.sessionIdleTtlSeconds,
		sessionAbsoluteTtlSeconds: config.auth.sessionAbsoluteTtlSeconds
	});
	const directoryService = createDirectoryService(createPrismaDirectoryRepository(prisma));
	const directoryRateLimiter = createRedisDirectoryRateLimiter(redis, {
		limit: config.directoryRateLimit.requests,
		windowSeconds: config.directoryRateLimit.windowSeconds
	});

	return {
		authService,
		credentialService,
		directoryService,
		directoryRateLimiter,
		checkReadiness: async (timeoutMs) => {
			const [databaseReady, redisReady] = await Promise.all([
				settlesWithin(prisma.$queryRaw`SELECT 1`, timeoutMs),
				settlesWithin(redis.ping(), timeoutMs)
			]);
			return databaseReady && redisReady;
		},
		close: async () => {
			let firstError: unknown;
			if (redis.status !== 'end') {
				try {
					await redis.quit();
				} catch {
					try {
						redis.disconnect();
					} catch (error) {
						firstError = error;
					}
				}
			}

			try {
				await prisma.$disconnect();
			} catch (error) {
				firstError = error;
			}
			try {
				await pool.end();
			} catch (error) {
				firstError ??= error;
			}

			if (firstError) throw firstError;
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
