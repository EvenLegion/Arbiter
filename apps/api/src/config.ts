import { z } from 'zod';

const ApiConfigSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	API_HOST: z.string().min(1).default('0.0.0.0'),
	API_PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
	API_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
	API_BODY_LIMIT_BYTES: z.coerce.number().int().min(1).max(1_048_576).default(65_536),
	API_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
	API_HEADERS_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
	API_KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(5_000),
	API_READINESS_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2_000),
	API_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
	API_DB_POOL_MAX: z.coerce.number().int().min(1).max(10).default(4),
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	REDIS_HOST: z.string().min(1).default('127.0.0.1'),
	REDIS_PORT: z.coerce.number().int().min(1).max(65_535).default(6379),
	REDIS_PASSWORD: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional()),
	REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
	API_REDIS_NAMESPACE: z
		.string()
		.min(1)
		.max(80)
		.regex(/^[a-z0-9:-]+$/)
		.default('arbiter:api:v1'),
	API_REDIS_MAX_TTL_SECONDS: z.coerce.number().int().min(1).max(86_400).default(3_600)
});

export type ApiConfig = {
	nodeEnv: z.infer<typeof ApiConfigSchema>['NODE_ENV'];
	host: string;
	port: number;
	logLevel: z.infer<typeof ApiConfigSchema>['API_LOG_LEVEL'];
	bodyLimitBytes: number;
	requestTimeoutMs: number;
	headersTimeoutMs: number;
	keepAliveTimeoutMs: number;
	readinessTimeoutMs: number;
	shutdownTimeoutMs: number;
	databaseUrl: string;
	databasePoolMax: number;
	redis: {
		host: string;
		port: number;
		password?: string;
		db: number;
		namespace: string;
		maxTtlSeconds: number;
	};
};

export function parseApiConfig(input: NodeJS.ProcessEnv = process.env): ApiConfig {
	const parsed = ApiConfigSchema.safeParse(input);
	if (!parsed.success) {
		const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
		throw new Error(`Invalid API environment configuration: ${message}`);
	}

	const value = parsed.data;
	return {
		nodeEnv: value.NODE_ENV,
		host: value.API_HOST,
		port: value.API_PORT,
		logLevel: value.API_LOG_LEVEL,
		bodyLimitBytes: value.API_BODY_LIMIT_BYTES,
		requestTimeoutMs: value.API_REQUEST_TIMEOUT_MS,
		headersTimeoutMs: value.API_HEADERS_TIMEOUT_MS,
		keepAliveTimeoutMs: value.API_KEEP_ALIVE_TIMEOUT_MS,
		readinessTimeoutMs: value.API_READINESS_TIMEOUT_MS,
		shutdownTimeoutMs: value.API_SHUTDOWN_TIMEOUT_MS,
		databaseUrl: value.DATABASE_URL,
		databasePoolMax: value.API_DB_POOL_MAX,
		redis: {
			host: value.REDIS_HOST,
			port: value.REDIS_PORT,
			password: value.REDIS_PASSWORD,
			db: value.REDIS_DB,
			namespace: value.API_REDIS_NAMESPACE,
			maxTtlSeconds: value.API_REDIS_MAX_TTL_SECONDS
		}
	};
}
